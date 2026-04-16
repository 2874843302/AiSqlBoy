export interface ConnectionConfig {
  id?: number;
  name: string;
  type: 'sqlite' | 'mysql' | 'postgresql' | 'oracle' | 'redis';
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string; // For MySQL, it's DB name; for SQLite, it's file path
  selectedSchemas?: string[]; // 数据库/Schema 过滤白名单；空或未设置表示显示全部
}

export interface TableInfo {
  name: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: any;
  autoIncrement?: boolean;
  comment?: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  type?: string; // e.g., BTREE, HASH (mostly for MySQL)
}

