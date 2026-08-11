import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');
import type { Database } from 'sqlite3';

import { app, safeStorage } from 'electron';
import { join } from 'path';
import { ConnectionConfig } from '../../shared/types';

/**
 * 使用系统级加密（Windows DPAPI / macOS Keychain）加密密码
 */
function encryptPassword(password: string | null | undefined): string | null {
  if (!password) return null;
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(password);
    return `enc:${encrypted.toString('base64')}`;
  }
  // 加密不可用时 fallback 到明文（带前缀标识）
  return `plain:${password}`;
}

/**
 * 解密密码，兼容旧的明文数据
 */
function decryptPassword(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith('enc:')) {
    const buffer = Buffer.from(stored.slice(4), 'base64');
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(buffer);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (stored.startsWith('plain:')) {
    return stored.slice(6);
  }
  // 旧数据（明文，无前缀）— 向后兼容
  return stored;
}

export class InternalDBService {
  private db: Database;

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = join(userDataPath, 'app_data.db');
    this.db = new sqlite3.Database(dbPath);
    this.init();
  }

  private init() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS connections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          host TEXT,
          port INTEGER,
          user TEXT,
          password TEXT,
          database TEXT,
          schema_filter TEXT
        )
      `);
      this.db.run('ALTER TABLE connections ADD COLUMN schema_filter TEXT', (err: any) => {
        if (err && !String(err.message || '').includes('duplicate column name')) {
          console.error('Failed to add schema_filter column:', err);
        }
      });
      this.db.run('ALTER TABLE connections ADD COLUMN read_only INTEGER NOT NULL DEFAULT 0', (err: any) => {
        if (err && !String(err.message || '').includes('duplicate column name')) {
          console.error('Failed to add read_only column:', err);
        }
      });
      this.db.run('ALTER TABLE connections ADD COLUMN locked INTEGER NOT NULL DEFAULT 0', (err: any) => {
        if (err && !String(err.message || '').includes('duplicate column name')) {
          console.error('Failed to add locked column:', err);
        }
      });
      this.db.run('ALTER TABLE connections ADD COLUMN expires_at INTEGER', (err: any) => {
        if (err && !String(err.message || '').includes('duplicate column name')) {
          console.error('Failed to add expires_at column:', err);
        }
      });
      this.db.run('ALTER TABLE connections ADD COLUMN allowed_database TEXT', (err: any) => {
        if (err && !String(err.message || '').includes('duplicate column name')) {
          console.error('Failed to add allowed_database column:', err);
        }
      });
      this.db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);
      this.db.run(`
        CREATE TABLE IF NOT EXISTS consoles (
          id TEXT PRIMARY KEY,
          connectionId INTEGER,
          name TEXT NOT NULL,
          sql TEXT,
          dbName TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      this.db.run(`
        CREATE TABLE IF NOT EXISTS agent_conversations (
          id TEXT PRIMARY KEY,
          connection_id INTEGER NOT NULL,
          title TEXT NOT NULL DEFAULT '新会话',
          messages TEXT NOT NULL DEFAULT '[]',
          selected_db TEXT,
          selected_table TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      this.db.run('CREATE INDEX IF NOT EXISTS idx_agent_conv_conn ON agent_conversations(connection_id)');
      // 迁移：为旧表添加新列
      this.db.run('ALTER TABLE agent_conversations ADD COLUMN selected_db TEXT', (err: any) => {
        if (err && !String(err.message || '').includes('duplicate column name')) console.error(err);
      });
      this.db.run('ALTER TABLE agent_conversations ADD COLUMN selected_table TEXT', (err: any) => {
        if (err && !String(err.message || '').includes('duplicate column name')) console.error(err);
      });
    });
  }

  saveConsole(console: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO consoles (id, connectionId, name, sql, dbName) VALUES (?, ?, ?, ?, ?)',
        [console.id, console.connectionId, console.name, console.sql, console.dbName],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  deleteConsole(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM consoles WHERE id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getConsoles(connectionId?: number): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = connectionId 
        ? 'SELECT * FROM consoles WHERE connectionId = ? ORDER BY createdAt ASC'
        : 'SELECT * FROM consoles ORDER BY createdAt ASC';
      const params = connectionId ? [connectionId] : [];
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  saveSetting(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getSetting(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row: any) => {
        if (err) reject(err);
        else resolve(row ? row.value : null);
      });
    });
  }

  saveConnection(config: ConnectionConfig): Promise<void> {
    const toFlag = (v: boolean | undefined) => (v ? 1 : 0);
    const toDbList = (v: string[] | undefined) =>
      v && v.length > 0 ? JSON.stringify(v) : null;
    return new Promise((resolve, reject) => {
      if (config.id) {
        // 先读出现有记录：导入包锁定的连接不允许通过更新解除只读/锁定/有效期/授权库
        this.db.get(
          'SELECT locked, expires_at, allowed_database FROM connections WHERE id = ?',
          [config.id],
          (gerr, row: any) => {
            if (gerr) {
              reject(gerr);
              return;
            }
            const forceLocked = !!row?.locked;
            const readOnly = forceLocked ? 1 : toFlag(config.readOnly);
            const locked = forceLocked ? 1 : toFlag(config.locked);
            // 锁定连接的有效期以库内原值为准，防止通过保存接口抹掉过期时间
            const expiresAt = forceLocked ? (row?.expires_at ?? null) : (config.expiresAt ?? null);
            // 锁定连接的授权库白名单以库内原值为准，防止通过保存接口扩大访问范围
            const allowedDatabases = forceLocked ? (row?.allowed_database ?? null) : toDbList(config.allowedDatabases);
            const stmt = this.db.prepare(`
              UPDATE connections 
              SET name = ?, type = ?, host = ?, port = ?, user = ?, password = ?, database = ?, schema_filter = ?, read_only = ?, locked = ?, expires_at = ?, allowed_database = ?
              WHERE id = ?
            `);
            stmt.run(
              config.name,
              config.type,
              config.host || null,
              config.port || null,
              config.user || null,
              encryptPassword(config.password),
              config.database || null,
              config.selectedSchemas && config.selectedSchemas.length > 0 ? JSON.stringify(config.selectedSchemas) : null,
              readOnly,
              locked,
              expiresAt,
              allowedDatabases,
              config.id,
              (err: Error | null) => {
                if (err) reject(err);
                else resolve();
              }
            );
            stmt.finalize();
          }
        );
      } else {
        // 插入新连接
        const stmt = this.db.prepare(`
          INSERT INTO connections (name, type, host, port, user, password, database, schema_filter, read_only, locked, expires_at, allowed_database)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          config.name,
          config.type,
          config.host || null,
          config.port || null,
          config.user || null,
          encryptPassword(config.password),
          config.database || null,
          config.selectedSchemas && config.selectedSchemas.length > 0 ? JSON.stringify(config.selectedSchemas) : null,
          toFlag(config.readOnly),
          toFlag(config.locked),
          config.expiresAt ?? null,
          toDbList(config.allowedDatabases),
          (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          }
        );
        stmt.finalize();
      }
    });
  }

  getConnections(): Promise<ConnectionConfig[]> {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM connections', (err, rows) => {
        if (err) reject(err);
        else {
          const parsed = (rows as any[]).map((row) => {
            let selectedSchemas: string[] | undefined;
            if (row.schema_filter) {
              try {
                const list = JSON.parse(String(row.schema_filter));
                if (Array.isArray(list)) {
                  selectedSchemas = list.map((v) => String(v));
                }
              } catch {
                selectedSchemas = undefined;
              }
            }
            // 授权库白名单：JSON 数组；兼容早期单库格式（纯字符串即库名）
            let allowedDatabases: string[] | undefined;
            if (row.allowed_database) {
              try {
                const list = JSON.parse(String(row.allowed_database));
                if (Array.isArray(list) && list.length > 0) {
                  allowedDatabases = list.map((v) => String(v));
                }
              } catch {
                allowedDatabases = [String(row.allowed_database)];
              }
            }
            return {
              ...row,
              password: decryptPassword(row.password),
              selectedSchemas,
              readOnly: !!row.read_only,
              locked: !!row.locked,
              expiresAt: row.expires_at ?? undefined,
              allowedDatabases
            } as ConnectionConfig;
          });
          resolve(parsed);
        }
      });
    });
  }

  deleteConnection(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM connections WHERE id = ?', id, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // ============================================================
  //  Agent 会话持久化
  // ============================================================

  /** 保存/更新 Agent 会话 */
  saveAgentConversation(conv: {
    id: string;
    connection_id: number;
    title: string;
    messages: string;
    selected_db?: string | null;
    selected_table?: string | null;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO agent_conversations (id, connection_id, title, messages, selected_db, selected_table, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [conv.id, conv.connection_id, conv.title, conv.messages, conv.selected_db ?? null, conv.selected_table ?? null],
        (err) => { if (err) reject(err); else resolve(); }
      );
    });
  }

  /** 获取指定连接下的所有 Agent 会话 */
  getAgentConversations(connectionId: number): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT id, connection_id, title, selected_db, selected_table, created_at, updated_at FROM agent_conversations WHERE connection_id = ? ORDER BY updated_at DESC',
        [connectionId],
        (err, rows) => { if (err) reject(err); else resolve(rows); }
      );
    });
  }

  /** 获取单个 Agent 会话（含消息内容） */
  getAgentConversation(id: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM agent_conversations WHERE id = ?',
        [id],
        (err, row) => { if (err) reject(err); else resolve(row); }
      );
    });
  }

  /** 重命名 Agent 会话 */
  renameAgentConversation(id: string, title: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE agent_conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [title, id],
        (err) => { if (err) reject(err); else resolve(); }
      );
    });
  }

  /** 删除 Agent 会话 */
  deleteAgentConversation(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM agent_conversations WHERE id = ?', [id], (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }
}

export const internalDB = new InternalDBService();
