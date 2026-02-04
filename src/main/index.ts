import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { internalDB } from './services/internalDB'
import { SQLiteDriver, MySQLDriver, PostgreSQLDriver, RedisDriver, IDatabaseDriver } from './services/dbDrivers'
import { aiService } from './services/aiService'
import fs from 'fs'
import { ConnectionConfig } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let currentDriver: IDatabaseDriver | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: join(__dirname, '../../src/assets/app.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: true,
      contextIsolation: true,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
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
    return { success: true }
  } catch (error: any) {
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
    const result = await currentDriver.executeQuery(sql)
    return { success: true, ...result }
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
ipcMain.handle('show-confirm-dialog', async (_, options: { message: string, title?: string, type?: 'question' | 'warning' | 'error' | 'info' }) => {
  if (!mainWindow) return false
  const result = await dialog.showMessageBox(mainWindow, {
    type: options.type || 'question',
    buttons: ['确定', '取消'],
    defaultId: 0,
    cancelId: 1,
    title: options.title || '确认',
    message: options.message,
    detail: '',
  })
  return result.response === 0
})
