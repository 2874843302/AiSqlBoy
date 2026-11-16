/**
 * 连接错误的人话映射
 *
 * UI 的「连接」动作与 MCP 连接池都会遇到同一批驱动错误，
 * 放在 shared 里保证两边提示一致。
 */

import type { ConnectionConfig } from './types';

const DEFAULT_PORT: Record<string, number | undefined> = {
  mysql: 3306,
  postgresql: 5432,
  oracle: 1521,
  redis: 6379,
};

export function mapConnectError(error: any, config: ConnectionConfig): string {
  const message = String(error?.message || '');
  const code = String(error?.code || '');
  const dbName = (config.database || '').trim();
  const host = error?.address || config.host || 'localhost';
  const port = error?.port || config.port || DEFAULT_PORT[config.type] || '';

  // ── 网络层：驱动常常只带 code 不带 message ──
  if (code === 'ECONNREFUSED') {
    return `无法连接 ${host}:${port}（连接被拒绝），请确认数据库服务已启动且端口正确`;
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
    return `连接 ${host}:${port} 超时，请检查网络、防火墙或安全组规则`;
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `无法解析主机名「${host}」，请检查地址拼写或 DNS 配置`;
  }
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return `网络不可达：${host}:${port}`;
  }
  if (code === 'ECONNRESET') {
    return `连接被对端重置：${host}:${port}，可能是服务端主动断开或中间设备拦截`;
  }

  // ── 认证 ──
  if (code === 'ER_ACCESS_DENIED_ERROR' || /access denied/i.test(message)) {
    return `认证失败：用户名或密码不正确${config.user ? `（${config.user}）` : ''}`;
  }
  if (code === '28P01' || /password authentication failed/i.test(message)) {
    return `认证失败：用户名或密码不正确${config.user ? `（${config.user}）` : ''}`;
  }
  if (/ORA-01017/i.test(message)) {
    return '认证失败：Oracle 用户名或密码不正确';
  }

  // ── 库 / 服务名不存在 ──
  if (config.type === 'mysql') {
    if (code === 'ER_BAD_DB_ERROR' || /unknown database/i.test(message)) {
      return dbName ? `数据库不存在：${dbName}` : '数据库不存在，请检查数据库名称';
    }
  }
  if (config.type === 'postgresql') {
    if (code === '3D000' || /database .* does not exist/i.test(message)) {
      return dbName ? `数据库不存在：${dbName}` : '数据库不存在，请检查数据库名称';
    }
  }
  if (config.type === 'oracle') {
    if (/ORA-12514|ORA-12154/i.test(message)) {
      return dbName ? `Oracle 服务名不存在：${dbName}` : 'Oracle 服务名不存在，请检查 Service Name';
    }
  }
  if (config.type === 'redis') {
    if (code === 'ECONNREFUSED' || /connect ECONNREFUSED/i.test(message)) {
      return `无法连接 Redis ${host}:${port}，请确认服务已启动`;
    }
    if (/WRONGPASS|invalid password/i.test(message)) {
      return 'Redis 认证失败：密码不正确';
    }
  }

  return message || code || '连接失败';
}
