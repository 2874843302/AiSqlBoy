import type { ConnectionConfig } from '../../shared/types';

declare global {
  interface Window {
    electronAPI: {
      getSavedConnections: () => Promise<ConnectionConfig[]>;
      saveConnection: (config: ConnectionConfig) => Promise<any>;
      deleteConnection: (id: number) => Promise<any>;

      // Console Management
      getConsoles: (connectionId?: number) => Promise<any[]>;
      saveConsole: (console: any) => Promise<any>;
      deleteConsole: (id: string) => Promise<any>;

      connectDB: (config: ConnectionConfig) => Promise<{ success: boolean; error?: string }>;
      getDatabases: () => Promise<string[]>;
      useDatabase: (dbName: string) => Promise<{ success: boolean; error?: string }>;
      getTables: () => Promise<{ name: string }[]>;
      getTableData: (
        tableName: string,
        limit?: number,
        offset?: number,
        orderBy?: string,
        orderDir?: 'ASC' | 'DESC'
      ) => Promise<{ data: any[]; total: number }>;
      getTableColumns: (tableName: string) => Promise<any[]>;
      renameTable: (oldName: string, newName: string) => Promise<{ success: boolean; error?: string }>;
      deleteTable: (tableName: string) => Promise<{ success: boolean; error?: string }>;
      createTable: (tableName: string, columns: any[], indexes?: any[]) => Promise<{ success: boolean; error?: string }>;
      getTableIndexes: (tableName: string) => Promise<any[]>;
      updateTableSchema: (tableName: string, changes: any) => Promise<{ success: boolean; error?: string }>;
      exportDatabase: (includeData: boolean) => Promise<{ success: boolean; error?: string }>;
      deleteDatabase: (dbName: string) => Promise<{ success: boolean; error?: string }>;
      executeQuery: (sql: string) => Promise<{
        success: boolean;
        data: any[];
        columns: string[];
        error?: string;
        hasMore?: boolean;
        isAutoLimited?: boolean;
        totalCount?: number;
        executionTime?: number;
      }>;
      aiChat: (messages: any[]) => Promise<{ success: boolean; response?: string; error?: string }>;
      saveSetting: (key: string, value: string) => Promise<void>;
      getSetting: (key: string) => Promise<string | null>;

      // Auto Update
      getAppVersion: () => Promise<string>;
      checkForUpdates: () => Promise<any>;
      downloadUpdate: () => Promise<any>;
      quitAndInstall: () => Promise<void>;
      onUpdateMessage: (callback: (message: string) => void) => void;
      onUpdateAvailable: (callback: (info: any) => void) => void;
      onUpdateNotAvailable: (callback: (info: any) => void) => void;
      onUpdateError: (callback: (error: string) => void) => void;
      onDownloadProgress: (callback: (progress: any) => void) => void;
      onUpdateDownloaded: (callback: (info: any) => void) => void;
    };
  }
}

export {};
