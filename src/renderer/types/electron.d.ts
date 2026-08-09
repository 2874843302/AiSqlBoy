import type { ConnectionConfig } from '../../shared/types';
import type { AgentResponse } from '../../shared/agentTypes';

declare global {
  interface Window {
    electronAPI: {
      getSavedConnections: () => Promise<ConnectionConfig[]>;
      saveConnection: (config: ConnectionConfig) => Promise<any>;
      validateConnection: (config: ConnectionConfig) => Promise<{ success: boolean; error?: string }>;
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

      // Agent
      agentCreateSession: (params: { connectionId: number; dbType: string; dbName: string; permissionLevel: 'readonly' | 'write-confirm' | 'full-control' }) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
      agentChat: (sessionId: string, message: string) => Promise<AgentResponse>;
      agentApprove: (sessionId: string, actionId: string, approved: boolean) => Promise<AgentResponse>;
      agentDestroySession: (sessionId: string) => Promise<{ success: boolean }>;
      agentUpdatePermission: (sessionId: string, permissionLevel: 'readonly' | 'write-confirm' | 'full-control') => Promise<{ success: boolean; error?: string }>;
      onAgentStreamToken: (callback: (data: { sessionId: string; delta: string }) => void) => void;
      offAgentStreamToken: () => void;

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

      // Agent Conversations
      agentSaveConversation: (conv: { id: string; connection_id: number; title: string; messages: string; selected_db?: string | null; selected_table?: string | null }) => Promise<{ success: boolean; error?: string }>;
      agentGetConversations: (connectionId: number) => Promise<{ id: string; connection_id: number; title: string; selected_db: string | null; selected_table: string | null; created_at: string; updated_at: string }[]>;
      agentGetConversation: (id: string) => Promise<{ id: string; connection_id: number; title: string; messages: string; selected_db: string | null; selected_table: string | null; created_at: string; updated_at: string } | null>;
      agentRenameConversation: (id: string, title: string) => Promise<{ success: boolean; error?: string }>;
      agentDeleteConversation: (id: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

export {};
