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
  readOnly?: boolean; // 只读模式：仅允许查询，禁止一切写操作
  locked?: boolean; // 来自导入的连接包：禁止编辑配置，防止本地改为可写
  expiresAt?: number; // 有效期截止（毫秒时间戳）：来自导入的连接包，到期后不可连接
  allowedDatabases?: string[]; // 授权库白名单：连接包仅允许访问这些数据库，禁止枚举/切换/跨库操作
}

/** 连接包解密预览（脱敏信息，不含账号口令等凭据） */
export interface ConnectionPackagePreview {
  name: string;
  type: string;
  allowedDatabases?: string[];
  expiresAt?: number;
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

