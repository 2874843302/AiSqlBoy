import { contextBridge, ipcRenderer } from 'electron'
import { ConnectionConfig } from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  // Saved connections
  getSavedConnections: () => ipcRenderer.invoke('get-saved-connections'),
  saveConnection: (config: ConnectionConfig) => ipcRenderer.invoke('save-connection', config),
  deleteConnection: (id: number) => ipcRenderer.invoke('delete-connection', id),
  
  // Console Management
  getConsoles: (connectionId?: number) => ipcRenderer.invoke('get-consoles', connectionId),
  saveConsole: (console: any) => ipcRenderer.invoke('save-console', console),
  deleteConsole: (id: string) => ipcRenderer.invoke('delete-console', id),
  
  // External DB
  connectDB: (config: ConnectionConfig) => ipcRenderer.invoke('connect-db', config),
  getDatabases: () => ipcRenderer.invoke('get-databases'),
  useDatabase: (dbName: string) => ipcRenderer.invoke('use-database', dbName),
  getTables: () => ipcRenderer.invoke('get-tables'),
  getTableData: (tableName: string, limit?: number, offset?: number, orderBy?: string, orderDir?: 'ASC' | 'DESC') => ipcRenderer.invoke('get-table-data', tableName, limit, offset, orderBy, orderDir),
  getTableColumns: (tableName: string) => ipcRenderer.invoke('get-table-columns', tableName),
  getTableIndexes: (tableName: string) => ipcRenderer.invoke('get-table-indexes', tableName),
  renameTable: (oldName: string, newName: string) => ipcRenderer.invoke('rename-table', oldName, newName),
    deleteTable: (tableName: string) => ipcRenderer.invoke('delete-table', tableName),
  createTable: (tableName: string, columns: any[], indexes?: any[]) => ipcRenderer.invoke('create-table', tableName, columns, indexes),
  updateTableSchema: (tableName: string, changes: any) => ipcRenderer.invoke('update-table-schema', tableName, changes),
    exportDatabase: (includeData: boolean) => ipcRenderer.invoke('export-database', includeData),
    deleteDatabase: (dbName: string) => ipcRenderer.invoke('delete-database', dbName),
    executeQuery: (sql: string) => ipcRenderer.invoke('execute-query', sql),
    
    // AI & Settings
    aiChat: (messages: any[]) => ipcRenderer.invoke('ai-chat', messages),
    saveSetting: (key: string, value: string) => ipcRenderer.invoke('save-setting', key, value),
    getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),
    
    // Dialogs
    showConfirmDialog: (options: { message: string, title?: string, type?: 'question' | 'warning' | 'error' | 'info' }) => 
        ipcRenderer.invoke('show-confirm-dialog', options),

    // Auto Update
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
    onUpdateMessage: (callback: (message: string) => void) => 
        ipcRenderer.on('update-message', (_, message) => callback(message)),
    onUpdateAvailable: (callback: (info: any) => void) => 
        ipcRenderer.on('update-available', (_, info) => callback(info)),
    onUpdateNotAvailable: (callback: (info: any) => void) => 
        ipcRenderer.on('update-not-available', (_, info) => callback(info)),
    onUpdateError: (callback: (error: string) => void) => 
        ipcRenderer.on('update-error', (_, error) => callback(error)),
    onDownloadProgress: (callback: (progress: any) => void) => 
        ipcRenderer.on('download-progress', (_, progress) => callback(progress)),
    onUpdateDownloaded: (callback: (info: any) => void) => 
        ipcRenderer.on('update-downloaded', (_, info) => callback(info)),
  }
)
