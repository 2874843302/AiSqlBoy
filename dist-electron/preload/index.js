"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld(
  "electronAPI",
  {
    // Saved connections
    getSavedConnections: () => electron.ipcRenderer.invoke("get-saved-connections"),
    saveConnection: (config) => electron.ipcRenderer.invoke("save-connection", config),
    deleteConnection: (id) => electron.ipcRenderer.invoke("delete-connection", id),
    // Console Management
    getConsoles: (connectionId) => electron.ipcRenderer.invoke("get-consoles", connectionId),
    saveConsole: (console) => electron.ipcRenderer.invoke("save-console", console),
    deleteConsole: (id) => electron.ipcRenderer.invoke("delete-console", id),
    // External DB
    connectDB: (config) => electron.ipcRenderer.invoke("connect-db", config),
    getDatabases: () => electron.ipcRenderer.invoke("get-databases"),
    useDatabase: (dbName) => electron.ipcRenderer.invoke("use-database", dbName),
    getTables: () => electron.ipcRenderer.invoke("get-tables"),
    getTableData: (tableName, limit, offset, orderBy, orderDir) => electron.ipcRenderer.invoke("get-table-data", tableName, limit, offset, orderBy, orderDir),
    getTableColumns: (tableName) => electron.ipcRenderer.invoke("get-table-columns", tableName),
    getTableIndexes: (tableName) => electron.ipcRenderer.invoke("get-table-indexes", tableName),
    renameTable: (oldName, newName) => electron.ipcRenderer.invoke("rename-table", oldName, newName),
    deleteTable: (tableName) => electron.ipcRenderer.invoke("delete-table", tableName),
    createTable: (tableName, columns, indexes) => electron.ipcRenderer.invoke("create-table", tableName, columns, indexes),
    updateTableSchema: (tableName, changes) => electron.ipcRenderer.invoke("update-table-schema", tableName, changes),
    exportDatabase: (includeData) => electron.ipcRenderer.invoke("export-database", includeData),
    deleteDatabase: (dbName) => electron.ipcRenderer.invoke("delete-database", dbName),
    executeQuery: (sql) => electron.ipcRenderer.invoke("execute-query", sql),
    // AI & Settings
    aiChat: (messages) => electron.ipcRenderer.invoke("ai-chat", messages),
    saveSetting: (key, value) => electron.ipcRenderer.invoke("save-setting", key, value),
    getSetting: (key) => electron.ipcRenderer.invoke("get-setting", key),
    // Dialogs
    showConfirmDialog: (options) => electron.ipcRenderer.invoke("show-confirm-dialog", options),
    // Auto Update
    getAppVersion: () => electron.ipcRenderer.invoke("get-app-version"),
    checkForUpdates: () => electron.ipcRenderer.invoke("check-for-updates"),
    downloadUpdate: () => electron.ipcRenderer.invoke("download-update"),
    quitAndInstall: () => electron.ipcRenderer.invoke("quit-and-install"),
    onUpdateMessage: (callback) => electron.ipcRenderer.on("update-message", (_, message) => callback(message)),
    onUpdateAvailable: (callback) => electron.ipcRenderer.on("update-available", (_, info) => callback(info)),
    onUpdateNotAvailable: (callback) => electron.ipcRenderer.on("update-not-available", (_, info) => callback(info)),
    onUpdateError: (callback) => electron.ipcRenderer.on("update-error", (_, error) => callback(error)),
    onDownloadProgress: (callback) => electron.ipcRenderer.on("download-progress", (_, progress) => callback(progress)),
    onUpdateDownloaded: (callback) => electron.ipcRenderer.on("update-downloaded", (_, info) => callback(info))
  }
);
