import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');
import type { Database } from 'sqlite3';

import { app } from 'electron';
import { join } from 'path';
import { ConnectionConfig } from '../../shared/types';

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
          database TEXT
        )
      `);
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
    return new Promise((resolve, reject) => {
      if (config.id) {
        // 更新现有连接
        const stmt = this.db.prepare(`
          UPDATE connections 
          SET name = ?, type = ?, host = ?, port = ?, user = ?, password = ?, database = ?
          WHERE id = ?
        `);
        stmt.run(
          config.name,
          config.type,
          config.host || null,
          config.port || null,
          config.user || null,
          config.password || null,
          config.database || null,
          config.id,
          (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          }
        );
        stmt.finalize();
      } else {
        // 插入新连接
        const stmt = this.db.prepare(`
          INSERT INTO connections (name, type, host, port, user, password, database)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          config.name,
          config.type,
          config.host || null,
          config.port || null,
          config.user || null,
          config.password || null,
          config.database || null,
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
        else resolve(rows as ConnectionConfig[]);
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
}

export const internalDB = new InternalDBService();
