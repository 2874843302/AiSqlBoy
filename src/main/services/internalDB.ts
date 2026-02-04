import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');

import { app } from 'electron';
import { join } from 'path';
import { ConnectionConfig } from '../../shared/types';

export class InternalDBService {
  private db: sqlite3.Database;

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
