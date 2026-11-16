import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { internalDB } from './services/internalDB'
import { createDriver, IDatabaseDriver } from './services/drivers'
import { startMcpServer, stopMcpServer, getMcpStatus } from './mcp/rpcServer'
import { MCP_SETTING_KEYS } from '../shared/mcpSettings'
import { aiService } from './services/aiService'
import { agentService, sanitizeAgentMessagesForStorage } from './services/agentService'
import fs from 'fs'
import crypto from 'crypto'
import { ConnectionConfig, ConnectionPackagePreview, QueryResultSet } from '../shared/types'
import { classifySql, hasMultipleStatements, stripSqlNoise, checkAllowedDatabaseSql, friendlyDbError, splitSqlStatements, ensureSelectLimit } from '../shared/sqlSecurity'
import { mapConnectError } from '../shared/dbErrors'
import { encryptConnectionPackage, decryptConnectionPackage } from './services/connectionPackage'

// 配置自动更新
autoUpdater.autoDownload = false // 默认不自动下载，由用户选择
autoUpdater.autoInstallOnAppQuit = true // 程序退出时自动安装

let mainWindow: BrowserWindow | null = null
let currentDriver: IDatabaseDriver | null = null
let heartbeatTimer: NodeJS.Timeout | null = null
let currentReadOnly = false // 当前连接是否只读模式
let currentAllowedDatabases: string[] | null = null // 限库连接包授权访问的数据库白名单（null 表示不限）
let currentDbType = '' // 当前连接类型，供 SQL 方言相关处理（如自动 LIMIT 语法）使用

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

  // 按设置启动本地 MCP 服务（外部 MCP 客户端通过 stdio 桥访问本机连接）
  void (async () => {
    try {
      const enabled = await internalDB.getSetting(MCP_SETTING_KEYS.enabled)
      if (enabled === 'true') {
        await startMcpServer()
      }
    } catch (error) {
      console.error('[mcp] 服务启动失败：', error)
    }
  })()

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

// 退出前关闭 MCP 服务与连接池，并清理端点文件
app.on('before-quit', () => {
  void stopMcpServer()
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
    currentDbType = config.type
    agentService.setDriver(currentDriver, config.id, currentAllowedDatabases)
    startHeartbeat()
    return { success: true }
  } catch (error: any) {
    currentDriver = null
    currentReadOnly = false
    currentAllowedDatabases = null
    currentDbType = ''
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

const MAX_ROWS_PER_FETCH = 10000

/**
 * 执行单条语句并归一化结果。
 * 抽出来是因为多语句执行需要逐条跑、逐条记录成功状态与耗时。
 * 自动行数上限走 ensureSelectLimit，按方言生成 LIMIT / FETCH FIRST
 * （此前硬编码 LIMIT，Oracle 执行 SELECT 会直接语法报错）。
 */
async function runSingleStatement(driver: IDatabaseDriver, sql: string, dbType: string) {
  const startedAt = Date.now();
  const limited = ensureSelectLimit(sql, MAX_ROWS_PER_FETCH + 1, dbType);
  const autoLimited = limited.modified;

  try {
    const result = await driver.executeQuery(limited.sql);
    let hasMore = false;
    if (autoLimited && result.data && result.data.length > MAX_ROWS_PER_FETCH) {
      result.data = result.data.slice(0, MAX_ROWS_PER_FETCH);
      hasMore = true;
    }
    return {
      sql,
      success: true as const,
      ...result,
      hasMore,
      isAutoLimited: autoLimited,
      totalCount: result.data ? result.data.length : 0,
      durationMs: Date.now() - startedAt
    };
  } catch (error: any) {
    return {
      sql,
      success: false as const,
      error: friendlyDbError(error?.message || '未知错误'),
      durationMs: Date.now() - startedAt
    };
  }
}

ipcMain.handle('execute-query', async (_, sql: string) => {
  if (!currentDriver) return { success: false, error: 'Not connected' };

  // 捕获引用：多语句执行期间用户可能切换连接，不能让后半程跑到另一个库上
  const driver = currentDriver;
  const dbType = currentDbType;

  const statements = splitSqlStatements(sql);
  if (!statements.length) return { success: false, error: '没有可执行的 SQL' };

  const results: QueryResultSet[] = [];

  for (const statement of statements) {
    // 只读 / 限库守卫逐条校验：命中即停，后续语句不再执行
    if (currentReadOnly) {
      const denyReason = checkReadOnlySql(statement);
      if (denyReason) {
        results.push({ sql: statement, success: false, error: denyReason, durationMs: 0 });
        break;
      }
    }
    if (currentAllowedDatabases) {
      const dbDenyReason = checkAllowedDatabaseSql(statement, currentAllowedDatabases);
      if (dbDenyReason) {
        results.push({ sql: statement, success: false, error: dbDenyReason, durationMs: 0 });
        break;
      }
    }

    const single = await runSingleStatement(driver, statement, dbType);
    results.push(single);

    // 遇错即停：避免在错误状态下继续执行后续语句，造成部分应用
    if (!single.success) break;
  }

  const last = results[results.length - 1];

  // 顶层字段保留最后一条的结果，兼容既有调用方；results 供多结果集展示
  return {
    ...last,
    success: results.every((r) => r.success),
    results,
    skippedCount: Math.max(0, statements.length - results.length)
  };
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

// ============================================================
//  MCP 服务（对外提供本地 MCP 能力）
// ============================================================

ipcMain.handle('mcp:get-status', async () => {
  const allowWrite = (await internalDB.getSetting(MCP_SETTING_KEYS.allowWrite)) === 'true'
  return { ...getMcpStatus(), allowWrite }
})

ipcMain.handle('mcp:set-enabled', async (_, enabled: boolean) => {
  try {
    await internalDB.saveSetting(MCP_SETTING_KEYS.enabled, enabled ? 'true' : 'false')
    if (enabled) {
      await startMcpServer()
    } else {
      await stopMcpServer()
    }
    const allowWrite = (await internalDB.getSetting(MCP_SETTING_KEYS.allowWrite)) === 'true'
    return { success: true, ...getMcpStatus(), allowWrite }
  } catch (error: any) {
    return { success: false, error: error.message, ...getMcpStatus() }
  }
})

ipcMain.handle('mcp:set-allow-write', async (_, enabled: boolean) => {
  await internalDB.saveSetting(MCP_SETTING_KEYS.allowWrite, enabled ? 'true' : 'false')
  const allowWrite = (await internalDB.getSetting(MCP_SETTING_KEYS.allowWrite)) === 'true'
  return { success: true, allowWrite }
})

/**
 * 给出可直接粘贴的客户端配置。
 *
 * 桥进程路径必须由主进程算：开发态在仓库 packages/ 下，
 * 打包后由 extraResources 复制到 resources/mcp-server。
 *
 * 运行时用应用自带的 Electron 可执行文件（ELECTRON_RUN_AS_NODE=1），
 * 这样客户端机器不需要预装 Node。桥只用 fetch + fs，不触碰 native 模块，
 * 在 Node 模式下运行完全没问题。
 */
ipcMain.handle('mcp:get-client-config', () => {
  const bridgePath = app.isPackaged
    ? join(process.resourcesPath, 'mcp-server', 'index.mjs')
    : join(__dirname, '../../packages/mcp-server/index.mjs')

  const config = {
    mcpServers: {
      aisqlboy: {
        command: process.execPath,
        args: [bridgePath],
        env: { ELECTRON_RUN_AS_NODE: '1' },
      },
    },
  }

  return { bridgePath, config: JSON.stringify(config, null, 2) }
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
