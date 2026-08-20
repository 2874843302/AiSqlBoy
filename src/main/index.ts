import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { internalDB } from './services/internalDB'
import { SQLiteDriver, MySQLDriver, PostgreSQLDriver, OracleDriver, RedisDriver, IDatabaseDriver } from './services/drivers'
import { aiService } from './services/aiService'
import { agentService, sanitizeAgentMessagesForStorage } from './services/agentService'
import fs from 'fs'
import crypto from 'crypto'
import { ConnectionConfig, ConnectionPackagePreview } from '../shared/types'
import { classifySql, hasMultipleStatements, stripSqlNoise, checkAllowedDatabaseSql } from '../shared/sqlSecurity'
import { encryptConnectionPackage, decryptConnectionPackage } from './services/connectionPackage'

// 配置自动更新
autoUpdater.autoDownload = false // 默认不自动下载，由用户选择
autoUpdater.autoInstallOnAppQuit = true // 程序退出时自动安装

let mainWindow: BrowserWindow | null = null
let currentDriver: IDatabaseDriver | null = null
let heartbeatTimer: NodeJS.Timeout | null = null
let currentReadOnly = false // 当前连接是否只读模式
let currentAllowedDatabases: string[] | null = null // 限库连接包授权访问的数据库白名单（null 表示不限）

// 连接包导入暂存：解密后的完整配置仅存于主进程内存，token 一次性、5 分钟过期
const pendingImports = new Map<string, { config: ConnectionConfig; expireAt: number }>()

const READONLY_DENY = '当前连接为只读模式，禁止此操作'

// 只读模式下校验 SQL：仅放行单条查询，拦截多语句拼接与 SELECT INTO OUTFILE 等伪装写入
function checkReadOnlySql(sql: string): string | null {
  if (hasMultipleStatements(sql)) return '只读模式下仅允许执行单条查询语句'
  if (/\bINTO\s+(OUTFILE|DUMPFILE)\b/i.test(stripSqlNoise(sql))) return '只读模式下禁止 SELECT INTO OUTFILE/DUMPFILE'
  if (classifySql(sql) !== 'SELECT') return READONLY_DENY + '（仅允许查询）'
  return null
}

function createDriver(config: ConnectionConfig): IDatabaseDriver {
  if (config.type === 'sqlite') {
    return new SQLiteDriver(config)
  }
  if (config.type === 'mysql') {
    return new MySQLDriver(config)
  }
  if (config.type === 'postgresql') {
    return new PostgreSQLDriver(config)
  }
  if (config.type === 'oracle') {
    return new OracleDriver(config)
  }
  if (config.type === 'redis') {
    return new RedisDriver(config)
  }
  throw new Error('Unsupported database type')
}

function mapConnectError(error: any, config: ConnectionConfig): string {
  const message = String(error?.message || '')
  const dbName = (config.database || '').trim()

  if (config.type === 'mysql') {
    if (error?.code === 'ER_BAD_DB_ERROR' || /unknown database/i.test(message)) {
      return dbName ? `数据库不存在：${dbName}` : '数据库不存在，请检查数据库名称'
    }
  }

  if (config.type === 'postgresql') {
    if (error?.code === '3D000' || /database .* does not exist/i.test(message)) {
      return dbName ? `数据库不存在：${dbName}` : '数据库不存在，请检查数据库名称'
    }
  }

  if (config.type === 'oracle') {
    if (/ORA-12514|ORA-12154/i.test(message)) {
      return dbName ? `Oracle 服务名不存在：${dbName}` : 'Oracle 服务名不存在，请检查 Service Name'
    }
  }

  return message || '连接失败'
}

function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(async () => {
    if (currentDriver) {
      try {
        // 使用驱动程序自定义的 ping 方法
        await currentDriver.ping();
      } catch (e) {
        console.log('Heartbeat failed, connection might be lost');
      }
    }
  }, 30000); // 每 30 秒发送一次心跳
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// 定义路径常量
const isDev = !!process.env.VITE_DEV_SERVER_URL
const DIST_PATH = join(__dirname, '../..')

// 开发环境开启更新检测配置
if (isDev) {
  autoUpdater.forceDevUpdateConfig = true
  // 可以在这里指定一个本地或测试用的 dev-app-update.yml 路径，如果没有则默认读取根目录
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: process.platform === 'darwin'
      ? undefined  // Mac 由 .app 包管理图标，无需设置窗口图标
      : isDev
        ? join(__dirname, '../../src/assets/app.ico')
        : join(DIST_PATH, 'dist/app.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: true,
      contextIsolation: true,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(DIST_PATH, 'dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // 自动检查更新逻辑
  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update-message', '正在检查更新...')
  })
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', info)
  })
  autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('update-not-available', info)
  })
  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-error', err.message)
  })
  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('download-progress', progressObj)
  })
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', info)
  })

  // 启动时自动检查一次更新
  autoUpdater.checkForUpdatesAndNotify()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 自动更新 IPC 处理器
ipcMain.handle('check-for-updates', async () => {
  return autoUpdater.checkForUpdates()
})

ipcMain.handle('download-update', async () => {
  return autoUpdater.downloadUpdate()
})

ipcMain.handle('quit-and-install', async () => {
  autoUpdater.quitAndInstall()
})

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// Internal DB IPC (Connection Management)
ipcMain.handle('get-saved-connections', async () => {
  return internalDB.getConnections()
})

ipcMain.handle('save-connection', async (_, config: ConnectionConfig) => {
  return internalDB.saveConnection(config)
})

ipcMain.handle('validate-connection', async (_, config: ConnectionConfig) => {
  let tempDriver: IDatabaseDriver | null = null
  try {
    tempDriver = createDriver(config)
    await tempDriver.connect()
    return { success: true }
  } catch (error: any) {
    return { success: false, error: mapConnectError(error, config) }
  } finally {
    if (tempDriver) {
      try {
        await tempDriver.disconnect()
      } catch {
        // ignore disconnect errors for validation flow
      }
    }
  }
})

ipcMain.handle('delete-connection', async (_, id: number) => {
  return internalDB.deleteConnection(id)
})

// 只读连接包：加密导出 / 选择文件 / 解密导入
ipcMain.handle('export-connection-package', async (_, config: ConnectionConfig, passphrase: string, expiresAt: number) => {
  try {
    if (!Array.isArray(config.allowedDatabases) || config.allowedDatabases.length === 0) {
      return { success: false, error: '请至少选择一个要授权的数据库再导出连接包' }
    }
    if (!expiresAt || typeof expiresAt !== 'number' || expiresAt <= Date.now()) {
      return { success: false, error: '无效的连接包有效期' }
    }
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
      title: '导出只读连接包',
      defaultPath: `${(config.name || 'connection').replace(/[\\/:*?"<>|]/g, '_')}.aisqlboy`,
      filters: [{ name: 'AiSqlBoy 连接包', extensions: ['aisqlboy'] }]
    })
    if (canceled || !filePath) return { success: false, error: 'User cancelled' }
    fs.writeFileSync(filePath, encryptConnectionPackage(config, passphrase, expiresAt), 'utf8')
    return { success: true, filePath }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('pick-connection-package-file', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
      title: '选择只读连接包',
      filters: [{ name: 'AiSqlBoy 连接包', extensions: ['aisqlboy'] }],
      properties: ['openFile']
    })
    if (canceled || !filePaths[0]) return { success: false, error: 'User cancelled' }
    return { success: true, content: fs.readFileSync(filePaths[0], 'utf8') }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('decrypt-connection-package', async (_, payload: string, passphrase: string) => {
  try {
    const config = decryptConnectionPackage(payload, passphrase)
    // 明文凭据只留在主进程：渲染进程仅获得脱敏预览 + 一次性 token（5 分钟有效）
    const now = Date.now()
    for (const [k, v] of pendingImports) if (now > v.expireAt) pendingImports.delete(k)
    const token = crypto.randomBytes(16).toString('hex')
    pendingImports.set(token, { config, expireAt: now + 5 * 60 * 1000 })
    const preview: ConnectionPackagePreview = {
      name: config.name,
      type: config.type,
      allowedDatabases: config.allowedDatabases,
      expiresAt: config.expiresAt
    }
    return { success: true, token, preview }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

// 确认导入：凭一次性 token 在主进程内完成入库，渲染进程全程接触不到凭据明文
ipcMain.handle('confirm-import-package', async (_, token: string, name: string) => {
  try {
    const entry = pendingImports.get(token)
    pendingImports.delete(token) // 一次性使用
    if (!entry || Date.now() > entry.expireAt) {
      return { success: false, error: '导入会话已失效或过期，请重新解密' }
    }
    const trimmed = String(name || '').trim()
    if (!trimmed) return { success: false, error: '连接名称不能为空' }
    const imported: ConnectionConfig = { ...entry.config, id: undefined, name: trimmed }
    await internalDB.saveConnection(imported)
    return { success: true, name: imported.name }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

// 导出当前数据（表视图/结果视图）为 CSV：BOM 头保证 Excel 中文不乱码
ipcMain.handle('save-table-csv', async (_, columns: string[], rows: any[], defaultName: string) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
      title: '导出 CSV',
      defaultPath: defaultName,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return { success: false, error: 'User cancelled' }
    const esc = (v: any) => {
      if (v === null || v === undefined) return ''
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const lines = [columns.map(esc).join(',')]
    for (const row of rows) lines.push(columns.map((c) => esc(row[c])).join(','))
    fs.writeFileSync(filePath, '\uFEFF' + lines.join('\r\n'), 'utf8')
    return { success: true, filePath }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

// Console Management IPC
ipcMain.handle('get-consoles', async (_, connectionId?: number) => {
  return internalDB.getConsoles(connectionId)
})

ipcMain.handle('save-console', async (_, console: any) => {
  return internalDB.saveConsole(console)
})

ipcMain.handle('delete-console', async (_, id: string) => {
  return internalDB.deleteConsole(id)
})

// External DB IPC (Data Browsing)
ipcMain.handle('connect-db', async (_, config: ConnectionConfig) => {
  try {
    // 导入包到期拦截：不信任渲染进程，主进程强制拒绝连接
    if (config.expiresAt && Date.now() > config.expiresAt) {
      return { success: false, error: `该只读连接已于 ${new Date(config.expiresAt).toLocaleString('zh-CN')} 过期，请联系分享者重新导出连接包` }
    }
    // 限库连接包：强制连接白名单内的库（优先保留配置库，否则取第一个），覆盖渲染进程传入的 database
    if (config.allowedDatabases && config.allowedDatabases.length > 0) {
      const targetDb = config.database && config.allowedDatabases.includes(config.database)
        ? config.database
        : config.allowedDatabases[0]
      config = { ...config, database: targetDb }
    }
    if (currentDriver) {
      await currentDriver.disconnect()
    }

    currentDriver = createDriver(config)
    // 连接丢失时通知渲染进程（toast 提示），不再让未捕获异常炸主进程
    currentDriver.onConnectionLost = (msg) => {
      mainWindow?.webContents.send('db-connection-lost', msg)
    }

    await currentDriver.connect()
    currentReadOnly = !!config.readOnly
    currentAllowedDatabases = config.allowedDatabases && config.allowedDatabases.length > 0 ? config.allowedDatabases : null
    agentService.setDriver(currentDriver, config.id, currentAllowedDatabases)
    startHeartbeat()
    return { success: true }
  } catch (error: any) {
    currentDriver = null
    currentReadOnly = false
    currentAllowedDatabases = null
    agentService.setDriver(null)
    stopHeartbeat()
    return { success: false, error: mapConnectError(error, config) }
  }
})

ipcMain.handle('get-databases', async () => {
  if (!currentDriver) return []
  // 限库连接包：只向渲染进程暴露白名单内的库，隐藏同实例其他库
  if (currentAllowedDatabases) return [...currentAllowedDatabases]
  try {
    return await currentDriver.getDatabases()
  } catch (error) {
    console.error('Error fetching databases:', error)
    return []
  }
})

ipcMain.handle('use-database', async (_, dbName: string) => {
  if (!currentDriver) return { success: false, error: 'Not connected' }
  // 限库连接包：拒绝切换到白名单以外的数据库
  if (currentAllowedDatabases && !currentAllowedDatabases.includes(dbName)) {
    return { success: false, error: `该连接包仅允许访问数据库：${currentAllowedDatabases.join('、')}` }
  }
  try {
    await currentDriver.useDatabase(dbName)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('get-tables', async () => {
  if (!currentDriver) return []
  try {
    return await currentDriver.getTables()
  } catch (error) {
    console.error('Error fetching tables:', error)
    return []
  }
})

ipcMain.handle('get-table-data', async (_, tableName: string, limit?: number, offset?: number, orderBy?: string, orderDir?: 'ASC' | 'DESC', filters?: Record<string, string>) => {
if (!currentDriver) return { data: [], total: 0 }
try {
return await currentDriver.getTableData(tableName, limit, offset, orderBy, orderDir, filters)
} catch (error) {
console.error(`Error fetching data from ${tableName}:`, error)
return { data: [], total: 0 }
}
})

ipcMain.handle('get-table-columns', async (_, tableName: string) => {
  if (!currentDriver) return []
  try {
    return await currentDriver.getTableColumns(tableName)
  } catch (error) {
    console.error(`Error fetching columns for ${tableName}:`, error)
    return []
  }
})

ipcMain.handle('get-table-indexes', async (_, tableName: string) => {
  if (!currentDriver) return []
  try {
    return await currentDriver.getTableIndexes(tableName)
  } catch (error) {
    console.error(`Error fetching indexes for ${tableName}:`, error)
    return []
  }
})

ipcMain.handle('rename-table', async (_, oldName: string, newName: string) => {
  if (!currentDriver) return { success: false, error: 'Not connected' }
  if (currentReadOnly) return { success: false, error: READONLY_DENY }
  try {
    await currentDriver.renameTable(oldName, newName)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('delete-table', async (_, tableName: string) => {
  if (!currentDriver) return { success: false, error: 'Not connected' }
  if (currentReadOnly) return { success: false, error: READONLY_DENY }
  try {
    await currentDriver.deleteTable(tableName)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('create-table', async (_, tableName: string, columns: any[], indexes?: any[]) => {
  if (!currentDriver) return { success: false, error: 'Not connected' }
  if (currentReadOnly) return { success: false, error: READONLY_DENY }
  try {
    await currentDriver.createTable(tableName, columns, indexes)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('update-table-schema', async (_, tableName: string, changes: any) => {
  if (!currentDriver) return { success: false, error: 'Not connected' }
  if (currentReadOnly) return { success: false, error: READONLY_DENY }
  try {
    await currentDriver.updateTableSchema(tableName, changes)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('export-database', async (_, includeData: boolean) => {
  if (!currentDriver) return { success: false, error: 'Not connected' }
  if (currentReadOnly) return { success: false, error: READONLY_DENY }
  try {
    const sql = await currentDriver.exportDatabase(includeData)
    const { filePath } = await dialog.showSaveDialog(mainWindow!, {
      title: '导出数据库 SQL',
      defaultPath: `export_${Date.now()}.sql`,
      filters: [{ name: 'SQL Files', extensions: ['sql'] }]
    })

    if (filePath) {
      fs.writeFileSync(filePath, sql)
      return { success: true }
    }
    return { success: false, error: 'User cancelled' }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('delete-database', async (_, dbName: string) => {
  if (!currentDriver) return { success: false, error: 'Not connected' }
  if (currentReadOnly) return { success: false, error: READONLY_DENY }
  try {
    await currentDriver.deleteDatabase(dbName)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('execute-query', async (_, sql: string) => {
  if (!currentDriver) return { success: false, error: 'Not connected' }
  if (currentReadOnly) {
    const denyReason = checkReadOnlySql(sql)
    if (denyReason) return { success: false, error: denyReason }
  }
  // 限库连接包：拦截白名单外的 USE/跨库引用等越库操作
  if (currentAllowedDatabases) {
    const dbDenyReason = checkAllowedDatabaseSql(sql, currentAllowedDatabases)
    if (dbDenyReason) return { success: false, error: dbDenyReason }
  }
  try {
    // 这里的 MAX_ROWS 是为了防止单次 IPC 传输过载
    // 我们应该鼓励用户使用分页，而不是一次性拉取所有数据
    const MAX_ROWS_PER_FETCH = 10000;
    
    // 简单的正则表达式检查是否已经有 LIMIT
    const hasLimit = /\blimit\b\s+\d+/i.test(sql);
    let executionSql = sql;
    
    // 如果是 SELECT 语句且没有 LIMIT，我们自动加上 LIMIT 以保护性能
    // 但我们会告知用户这一点
    const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
    let autoLimited = false;
    
    if (isSelect && !hasLimit) {
      // 这里的 10001 是为了判断是否还有更多数据
      executionSql = `${sql.trim().replace(/;$/, '')} LIMIT ${MAX_ROWS_PER_FETCH + 1}`;
      autoLimited = true;
    }

    const result = await currentDriver.executeQuery(executionSql);
    
    let hasMore = false;
    if (autoLimited && result.data && result.data.length > MAX_ROWS_PER_FETCH) {
      result.data = result.data.slice(0, MAX_ROWS_PER_FETCH);
      hasMore = true;
    }
    
    return { 
      success: true, 
      ...result, 
      hasMore, 
      totalCount: result.data ? result.data.length : 0,
      isAutoLimited: autoLimited
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

// AI & Settings IPC
ipcMain.handle('ai-chat', async (_, messages: any[]) => {
  try {
    const response = await aiService.chat(messages)
    return { success: true, response }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('save-setting', async (_, key: string, value: string) => {
  return internalDB.saveSetting(key, value)
})

ipcMain.handle('get-setting', async (_, key: string) => {
  return internalDB.getSetting(key)
})

// Native Dialog IPC
ipcMain.handle('show-confirm-dialog', async (_, options: { message: string, title?: string, type?: 'question' | 'warning' | 'error' | 'info', buttons?: string[] }) => {
  if (!mainWindow) return false
  const result = await dialog.showMessageBox(mainWindow, {
    type: options.type || 'question',
    buttons: options.buttons || ['确定', '取消'],
    defaultId: 0,
    cancelId: options.buttons ? options.buttons.length - 1 : 1,
    title: options.title || '确认',
    message: options.message,
    detail: '',
  })
  // 如果提供了自定义按钮，返回索引，否则返回布尔值
  if (options.buttons) {
    return result.response
  }
  return result.response === 0
})

// Agent IPC

// 设置流式 token 推送：AI 每生成一个 token 片段就推送给前端
agentService.setStreamCallback((sessionId: string, delta: string) => {
  mainWindow?.webContents.send('agent:stream-token', { sessionId, delta })
})

ipcMain.handle('agent:create-session', async (_, params: { connectionId: number; dbType: string; dbName: string; permissionLevel: 'readonly' | 'write-confirm' | 'full-control' }) => {
  try {
    // 只读连接强制降级 Agent 权限，不信任前端传入值
    if (currentReadOnly) params = { ...params, permissionLevel: 'readonly' }
    const sessionId = await agentService.createSession(params)
    return { success: true, sessionId }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('agent:chat', async (_, { sessionId, message }: { sessionId: string; message: string }) => {
  try {
    return await agentService.handleMessage(sessionId, message)
  } catch (error: any) {
    return { type: 'error', error: error.message, status: 'error' }
  }
})

ipcMain.handle('agent:approve', async (_, { sessionId, actionId, approved }: { sessionId: string; actionId: string; approved: boolean }) => {
  try {
    return await agentService.handleApproval(sessionId, actionId, approved)
  } catch (error: any) {
    return { type: 'error', error: error.message, status: 'error' }
  }
})

ipcMain.handle('agent:cancel', async (_, sessionId: string) => {
  return agentService.cancelSession(sessionId)
})

ipcMain.handle('agent:destroy-session', async (_, sessionId: string) => {
  agentService.destroySession(sessionId)
  return { success: true }
})

ipcMain.handle('agent:update-permission', async (_, { sessionId, permissionLevel }: { sessionId: string; permissionLevel: 'readonly' | 'write-confirm' | 'full-control' }) => {
  // 只读连接下不允许提升权限
  if (currentReadOnly) permissionLevel = 'readonly'
  return agentService.updatePermission(sessionId, permissionLevel)
})

// Agent 会话持久化
ipcMain.handle('agent:save-conversation', async (_, conv: { id: string; connection_id: number; title: string; messages: string; selected_db?: string | null; selected_table?: string | null }) => {
  try {
    // 持久化前截断大查询结果，避免存储膨胀
    await internalDB.saveAgentConversation({ ...conv, messages: sanitizeAgentMessagesForStorage(conv.messages) })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('agent:get-conversations', async (_, connectionId: number) => {
  try {
    return await internalDB.getAgentConversations(connectionId)
  } catch (error: any) {
    return []
  }
})

ipcMain.handle('agent:get-conversation', async (_, id: string) => {
  try {
    return await internalDB.getAgentConversation(id)
  } catch (error: any) {
    return null
  }
})

ipcMain.handle('agent:rename-conversation', async (_, { id, title }: { id: string; title: string }) => {
  try {
    await internalDB.renameAgentConversation(id, title)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('agent:delete-conversation', async (_, id: string) => {
  try {
    await internalDB.deleteAgentConversation(id)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
