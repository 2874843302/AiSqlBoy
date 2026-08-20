import { createClient } from 'redis';
import type { IDatabaseDriver, ConnectionConfig, TableInfo, ColumnInfo, IndexInfo } from './types';

export class RedisDriver implements IDatabaseDriver {
  private client: any = null;
  onConnectionLost?: (message: string) => void;
  constructor(private config: ConnectionConfig) {}

  async connect() {
    let url = 'redis://';
    if (this.config.user) {
      url += `${this.config.user}:${this.config.password || ''}@`;
    } else if (this.config.password) {
      url += `:${this.config.password}@`;
    }
    url += `${this.config.host || 'localhost'}:${this.config.port || 6379}`;
    
    this.client = createClient({ url });
    // redis v4 必须监听 error 事件，否则连接异常会变成未捕获异常炸主进程
    this.client.on('error', (err: any) => {
      console.error('[Redis] connection error:', err?.message);
      this.onConnectionLost?.(err?.message || '连接已断开');
    });
    await this.client.connect();
  }

  async disconnect() {
    await this.client?.quit();
  }

  async getDatabases(): Promise<string[]> {
    // 动态读取 databases 配置（默认 16），失败时回退 16
    try {
      const res = await this.client.configGet('databases');
      const n = parseInt(res?.databases ?? '16', 10);
      return Array.from({ length: Number.isFinite(n) && n > 0 ? n : 16 }, (_, i) => i.toString());
    } catch {
      return Array.from({ length: 16 }, (_, i) => i.toString());
    }
  }

  async useDatabase(dbName: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    await this.client.select(parseInt(dbName));
  }

  async getTables(): Promise<TableInfo[]> {
    if (!this.client) throw new Error('Not connected');
    // Redis 中没有表，我们把 keys 映射为 "表" 的概念，或者返回一个固定的 "Keys"
    return [{ name: 'Keys' }];
  }

  async getTableColumns(tableName: string): Promise<ColumnInfo[]> {
    // Redis 模拟列：Key, Type, Value, TTL
    return [
      { name: 'key', type: 'string', nullable: false, primaryKey: true },
      { name: 'type', type: 'string', nullable: false, primaryKey: false },
      { name: 'value', type: 'string', nullable: true, primaryKey: false },
      { name: 'ttl', type: 'number', nullable: true, primaryKey: false }
    ];
  }

  async getTableIndexes(tableName: string): Promise<IndexInfo[]> {
    return [];
  }

  async getTableData(tableName: string, limit = 100, offset = 0, orderBy?: string, orderDir: 'ASC' | 'DESC' = 'ASC'): Promise<{ data: any[], total: number }> {
    if (!this.client) throw new Error('Not connected');

    // 用 SCAN 增量收集 key，避免 KEYS * 阻塞 Redis 主线程；上限 1 万条
    const keys: string[] = [];
    const MAX_KEYS = 10000;
    for await (const key of this.client.scanIterator({ MATCH: '*', COUNT: 1000 })) {
      keys.push(key);
      if (keys.length >= MAX_KEYS) break;
    }
    keys.sort();
    const total = keys.length;
    const pagedKeys = keys.slice(offset, offset + limit);
    
    const data = await Promise.all(pagedKeys.map(async (key: string) => {
      const type = await this.client.type(key);
      const ttl = await this.client.ttl(key);
      let value = '';
      
      if (type === 'string') value = await this.client.get(key);
      else if (type === 'hash') value = JSON.stringify(await this.client.hGetAll(key));
      else if (type === 'list') value = JSON.stringify(await this.client.lRange(key, 0, -1));
      else if (type === 'set') value = JSON.stringify(await this.client.sMembers(key));
      else if (type === 'zset') value = JSON.stringify(await this.client.zRange(key, 0, -1));
      
      return { key, type, value, ttl };
    }));

    return { data, total };
  }

  async renameTable(oldName: string, newName: string): Promise<void> {
    throw new Error('Redis 不支持表重命名操作');
  }

  async deleteTable(tableName: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    await this.client.del(tableName);
  }

  async createTable(tableName: string, columns: ColumnInfo[], indexes?: IndexInfo[]): Promise<void> {
    throw new Error('Redis 不支持创建表操作');
  }

  async updateTableSchema(tableName: string, changes: any): Promise<void> {
    throw new Error('Redis 不支持修改表结构操作');
  }

  async exportDatabase(includeData: boolean): Promise<string> {
    if (!this.client) throw new Error('Not connected');
    const keys: string[] = [];
    for await (const key of this.client.scanIterator({ MATCH: '*', COUNT: 1000 })) {
      keys.push(key);
      if (keys.length >= 10000) break;
    }
    let output = `# AiSqlBoy Redis Export\n# Date: ${new Date().toLocaleString()}\n\n`;
    
    for (const key of keys) {
      const type = await this.client.type(key);
      if (type === 'string') {
        const val = await this.client.get(key);
        output += `SET "${key}" "${val}"\n`;
      }
      // 可以继续添加其他类型的导出
    }
    return output;
  }

  async deleteDatabase(dbName: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    await this.client.flushDb();
  }

  async executeQuery(sql: string): Promise<{ data: any[], columns: string[], affectedRows?: number }> {
    if (!this.client) throw new Error('Not connected');
    
    // 解析 Redis 命令，支持引号包裹的参数
    const parseCommand = (cmdStr: string): string[] => {
      const args: string[] = [];
      let current = '';
      let inQuotes = false;
      let quoteChar = '';

      for (let i = 0; i < cmdStr.length; i++) {
        const char = cmdStr[i];
        if (inQuotes) {
          if (char === quoteChar) {
            inQuotes = false;
            // 引号结束，不立即推入，允许后面紧跟字符（虽然 Redis 命令通常不这样，但为了健壮性）
          } else if (char === '\\' && i + 1 < cmdStr.length) {
            // 处理转义字符
            current += cmdStr[++i];
          } else {
            current += char;
          }
        } else {
          if (char === '"' || char === "'") {
            inQuotes = true;
            quoteChar = char;
          } else if (/\s/.test(char)) {
            if (current) {
              args.push(current);
              current = '';
            }
          } else {
            current += char;
          }
        }
      }
      if (current) args.push(current);
      return args;
    };

    const args = parseCommand(sql.trim());
    if (args.length === 0) return { data: [], columns: [] };

    try {
      // 使用 sendCommand 执行原始命令
      const res = await this.client.sendCommand(args);
      
      // 格式化输出结果
      const formatResult = (val: any): any => {
        if (val === null) return 'null';
        if (val === undefined) return 'undefined';
        if (Array.isArray(val)) {
          return `[${val.map(formatResult).join(', ')}]`;
        }
        if (typeof val === 'object') {
          return JSON.stringify(val);
        }
        return val.toString();
      };

      return {
        data: [{ 结果: formatResult(res) }],
        columns: ['结果']
      };
    } catch (err: any) {
      // Redis 自动重连处理
      const isConnectionError = 
        err.message.includes('closed') || 
        err.message.includes('Socket') || 
        err.message.includes('reconnecting') ||
        err.message.includes('connection lost');

      if (isConnectionError) {
        try {
          await this.connect();
          const res = await this.client!.sendCommand(args);
          return {
            data: [{ 结果: (res === null ? 'null' : (typeof res === 'object' ? JSON.stringify(res) : res.toString())) }],
            columns: ['结果']
          };
        } catch (reconnectError: any) {
          throw new Error(`Redis 连接已断开且重连失败: ${reconnectError.message}`);
        }
      }
      throw new Error(`Redis 执行失败: ${err.message}`);
    }
  }

  async ping(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.ping();
    } catch (error: any) {
      await this.connect();
    }
  }
}