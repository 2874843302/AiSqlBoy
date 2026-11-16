export type { IDatabaseDriver, ConnectionConfig, TableInfo, ColumnInfo, IndexInfo } from './types';

export { SQLiteDriver } from './SQLiteDriver';
export { MySQLDriver } from './MySQLDriver';
export { PostgreSQLDriver } from './PostgreSQLDriver';
export { OracleDriver } from './OracleDriver';
export { RedisDriver } from './RedisDriver';

import type { ConnectionConfig, IDatabaseDriver } from './types';
import { SQLiteDriver } from './SQLiteDriver';
import { MySQLDriver } from './MySQLDriver';
import { PostgreSQLDriver } from './PostgreSQLDriver';
import { OracleDriver } from './OracleDriver';
import { RedisDriver } from './RedisDriver';

/**
 * 按连接配置创建驱动实例。
 * UI 主连接与 MCP 连接池共用同一工厂，避免两处维护方言分支。
 */
export function createDriver(config: ConnectionConfig): IDatabaseDriver {
  switch (config.type) {
    case 'sqlite':
      return new SQLiteDriver(config);
    case 'mysql':
      return new MySQLDriver(config);
    case 'postgresql':
      return new PostgreSQLDriver(config);
    case 'oracle':
      return new OracleDriver(config);
    case 'redis':
      return new RedisDriver(config);
    default:
      throw new Error('Unsupported database type');
  }
}
