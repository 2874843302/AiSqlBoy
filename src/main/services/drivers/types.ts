import type { ConnectionConfig, TableInfo, ColumnInfo, IndexInfo } from '../../../shared/types';

export interface IDatabaseDriver {
  /** 连接丢失回调（主进程设置，用于通知渲染进程；服务端断开/网络中断时触发） */
  onConnectionLost?: (message: string) => void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getDatabases(): Promise<string[]>;
  useDatabase(dbName: string): Promise<void>;
  getTables(): Promise<TableInfo[]>;
  getTableColumns(tableName: string): Promise<ColumnInfo[]>;
  getTableIndexes(tableName: string): Promise<IndexInfo[]>;
  getTableData(tableName: string, limit?: number, offset?: number, orderBy?: string, orderDir?: 'ASC' | 'DESC', filters?: Record<string, string>): Promise<{ data: any[], total: number }>;
  renameTable(oldName: string, newName: string): Promise<void>;
  deleteTable(tableName: string): Promise<void>;
  createTable(tableName: string, columns: ColumnInfo[], indexes?: IndexInfo[]): Promise<void>;
  updateTableSchema(tableName: string, changes: {
    added: ColumnInfo[];
    modified: { oldName: string; column: ColumnInfo }[];
    removed: string[];
    indexes?: {
      added: IndexInfo[];
      removed: string[];
    };
  }): Promise<void>;
  exportDatabase(includeData: boolean): Promise<string>;
  deleteDatabase(dbName: string): Promise<void>;
  executeQuery(sql: string): Promise<{ data: any[], columns: string[], affectedRows?: number }>;
  ping(): Promise<void>;
}

export type { ConnectionConfig, TableInfo, ColumnInfo, IndexInfo };