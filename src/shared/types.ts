export interface ConnectionConfig {
  id?: number;
  name: string;
  type: 'sqlite' | 'mysql' | 'postgresql' | 'redis';
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string; // For MySQL, it's DB name; for SQLite, it's file path
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

