/**
 * MCP 连接池
 *
 * 设计要点：
 * 1. 与 UI 的 currentDriver 完全隔离 —— MCP 自己建连接，用户在界面切库不会打断外部 AI 会话。
 * 2. 按 connectionId + database 组合缓存，每条组合一条独立连接，天然避免多会话互相 select 串库。
 * 3. 连接配置每次 acquire 都从 internalDB 现读，保证过期时间、授权库白名单、只读标记的改动即时生效。
 * 4. 池内不长期持有密码：Entry.config 中 password 已抹除。
 */

import { internalDB } from '../services/internalDB';
import { createDriver, IDatabaseDriver } from '../services/drivers';
import type { ConnectionConfig } from '../../shared/types';
import { mapConnectError } from '../../shared/dbErrors';

const IDLE_MS = 5 * 60 * 1000;
const SWEEP_MS = 60 * 1000;

export interface PooledConnection {
  driver: IDatabaseDriver;
  /** 已抹除密码的连接配置，供权限判断使用 */
  config: ConnectionConfig;
  /** 当前实际使用的库（Oracle 为 schema，Redis 为 db 索引，SQLite 为空） */
  database: string;
}

interface Entry extends PooledConnection {
  key: string;
  lastUsed: number;
}

class DriverPool {
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Promise<Entry>>();
  private sweeper: NodeJS.Timeout | null = null;

  /** 读取连接配置，并拦截已过期的连接包 */
  async resolveConfig(connectionId: number): Promise<ConnectionConfig> {
    if (!Number.isFinite(connectionId)) throw new Error('connectionId 必须是数字');
    const all = await internalDB.getConnections();
    const config = all.find((c) => c.id === connectionId);
    if (!config) throw new Error(`连接不存在：${connectionId}`);
    if (config.expiresAt && Date.now() > config.expiresAt) {
      throw new Error(`该连接已于 ${new Date(config.expiresAt).toLocaleString('zh-CN')} 过期，请重新导入连接包`);
    }
    return config;
  }

  /** 授权库白名单校验（限库连接包） */
  private assertDatabaseAllowed(config: ConnectionConfig, database: string): void {
    if (!database) return;
    const allowed = config.allowedDatabases;
    if (allowed && allowed.length > 0 && !allowed.includes(database)) {
      throw new Error(`该连接仅授权访问：${allowed.join('、')}，无法访问「${database}」`);
    }
  }

  async acquire(connectionId: number, database?: string): Promise<PooledConnection> {
    const config = await this.resolveConfig(connectionId);
    const db = String(database || config.database || '').trim();
    this.assertDatabaseAllowed(config, db);

    const key = `${connectionId}::${db}`;
    const hit = this.entries.get(key);
    if (hit) {
      hit.lastUsed = Date.now();
      return hit;
    }

    // 同一 key 并发 acquire 时复用同一次 connect，避免重复建连
    const inflight = this.pending.get(key);
    if (inflight) {
      const entry = await inflight;
      entry.lastUsed = Date.now();
      return entry;
    }

    const task = this.spawn(key, config, db).catch((error) => {
      // 驱动错误常常只有 code 没有 message，统一翻译成人话再抛给工具层
      throw new Error(mapConnectError(error, config));
    });
    this.pending.set(key, task);
    try {
      const entry = await task;
      this.entries.set(key, entry);
      this.ensureSweeper();
      return entry;
    } finally {
      this.pending.delete(key);
    }
  }

  private async spawn(key: string, config: ConnectionConfig, db: string): Promise<Entry> {
    let driver: IDatabaseDriver;

    if (config.type === 'sqlite') {
      // SQLite 的 database 就是文件路径，忽略调用方传入的库名
      driver = createDriver(config);
    } else if (config.type === 'mysql') {
      driver = createDriver({ ...config, database: db || config.database });
    } else if (config.type === 'postgresql') {
      if (db && config.database && db !== config.database) {
        throw new Error(`PostgreSQL 不支持跨库查询，当前连接固定在「${config.database}」，无法切换到「${db}」`);
      }
      driver = createDriver({ ...config, database: db || config.database });
    } else {
      // Oracle（schema）与 Redis（db 索引）在连接后切库
      driver = createDriver(config);
    }

    driver.onConnectionLost = () => {
      void this.drop(key);
    };

    await driver.connect();

    if ((config.type === 'oracle' || config.type === 'redis') && db) {
      await driver.useDatabase(db);
    }

    const { password: _omit, ...safeConfig } = config;
    return { key, driver, config: safeConfig, database: db, lastUsed: Date.now() };
  }

  private async drop(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    try {
      await entry.driver.disconnect();
    } catch {
      // 断链场景下 disconnect 可能再抛错，忽略
    }
  }

  private ensureSweeper(): void {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.entries) {
        if (now - entry.lastUsed > IDLE_MS) {
          void this.drop(key);
        }
      }
    }, SWEEP_MS);
    this.sweeper.unref?.();
  }

  /** 关闭连接池并释放所有连接（设置页关闭 MCP 或应用退出时调用） */
  async disposeAll(): Promise<void> {
    if (this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = null;
    }
    const keys = [...this.entries.keys()];
    await Promise.all(keys.map((k) => this.drop(k)));
  }

  get size(): number {
    return this.entries.size;
  }
}

export const driverPool = new DriverPool();
