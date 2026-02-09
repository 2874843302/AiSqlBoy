import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { internalDB } from './services/internalDB'
import { SQLiteDriver, MySQLDriver, PostgreSQLDriver, RedisDriver, IDatabaseDriver } from './services/dbDrivers'
import { aiService } from './services/aiService'
import fs from 'fs'
import { ConnectionConfig } from '../shared/types'

// 配置自动更新
autoUpdater.autoDownload = false // 默认不自动下载，由用户选择
autoUpdater.autoInstallOnAppQuit = true // 程序退出时自动安装

let mainWindow: BrowserWindow | null = null
let currentDriver: IDatabaseDriver | null = null
let heartbeatTimer: NodeJS.Timeout | null = null

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
    icon: isDev 
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

ipcMain.handle('delete-connection', async (_, id: number) => {
  return internalDB.deleteConnection(id)
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
    if (currentDriver) {
      await currentDriver.disconnect()
    }
    
    if (config.type === 'sqlite') {
      currentDriver = new SQLiteDriver(config)
    } else if (config.type === 'mysql') {
      currentDriver = new MySQLDriver(config)
    } else if (config.type === 'postgresql') {
      currentDriver = new PostgreSQLDriver(config)
    } else if (config.type === 'redis') {
      currentDriver = new RedisDriver(config)
    } else {
      throw new Error('Unsupported database type')
    }

    await currentDriver.connect()
    startHeartbeat()
    return { success: true }
  } catch (error: any) {
    stopHeartbeat()
    return { success: false, error: error.message }
  }
})

ipcMain.handle('get-databases', async () => {
  if (!currentDriver) return []
  try {
    return await currentDriver.getDatabases()
  } catch (error) {
    console.error('Error fetching databases:', error)
    return []
  }
})

ipcMain.handle('use-database', async (_, dbName: string) => {
  if (!currentDriver) return { success: false, error: 'Not connected' }
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

ipcMain.handle('get-table-data', async (_, tableName: string, limit?: number, offset?: number, orderBy?: string, orderDir?: 'ASC' | 'DESC') => {
  if (!currentDriver) return { data: [], total: 0 }
  try {
    return await currentDriver.getTableData(tableName, limit, offset, orderBy, orderDir)
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
  try {
    await currentDriver.renameTable(oldName, newName)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('delete-table', async (_, tableName: string) => {
  if (!currentDriver) return { success: false, error: 'Not connected' }
  try {
    await currentDriver.deleteTable(tableName)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('create-table', async (_, tableName: string, columns: any[], indexes?: any[]) => {
  if (!currentDriver) return { success: false, error: 'Not connected' }
  try {
    await currentDriver.createTable(tableName, columns, indexes)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('update-table-schema', async (_, tableName: string, changes: any) => {
  if (!currentDriver) return { success: false, error: 'Not connected' }
  try {
    await currentDriver.updateTableSchema(tableName, changes)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('export-database', async (_, includeData: boolean) => {
  if (!currentDriver) return { success: false, error: 'Not connected' }
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
  try {
    await currentDriver.deleteDatabase(dbName)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('execute-query', async (_, sql: string) => {
  if (!currentDriver) return { success: false, error: 'Not connected' }
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
