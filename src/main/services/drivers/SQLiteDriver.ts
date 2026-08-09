import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');
import type { Database } from 'sqlite3';
import type { IDatabaseDriver, ConnectionConfig, TableInfo, ColumnInfo, IndexInfo } from './types';

export class SQLiteDriver implements IDatabaseDriver {
  private db: Database | null = null;
  constructor(private config: ConnectionConfig) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.config.database!, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db?.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async getDatabases(): Promise<string[]> {
    // SQLite 只有单个数据库文件，返回其文件名或 "main"
    return ['main'];
  }

  async useDatabase(dbName: string): Promise<void> {
    // SQLite 不需要切换数据库
  }

  async getTables(): Promise<TableInfo[]> {
    if (!this.db) throw new Error('Not connected');
    return new Promise((resolve, reject) => {
      this.db!.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
        if (err) reject(err);
        else resolve(rows as TableInfo[]);
      });
    });
  }

  async getTableColumns(tableName: string): Promise<ColumnInfo[]> {
    if (!this.db) throw new Error('Not connected');
    return new Promise((resolve, reject) => {
      this.db!.all(`PRAGMA table_info(${tableName})`, (err, rows: any[]) => {
        if (err) reject(err);
        else {
          // 获取更多详细信息，如是否自增
          this.db!.all(`SELECT name, sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`, (err2, masterRows: any[]) => {
            const tableSql = masterRows[0]?.sql || '';
            resolve(rows.map(c => ({
              name: c.name,
              type: c.type,
              nullable: c.notnull === 0,
              primaryKey: c.pk === 1,
              defaultValue: c.dflt_value,
              autoIncrement: tableSql.toUpperCase().includes('AUTOINCREMENT') && c.pk === 1
            })));
          });
        }
      });
    });
  }

  async getTableIndexes(tableName: string): Promise<IndexInfo[]> {
    if (!this.db) throw new Error('Not connected');
    return new Promise((resolve, reject) => {
      this.db!.all(`PRAGMA index_list(${tableName})`, (err, rows: any[]) => {
        if (err) reject(err);
        else {
          const indexes: IndexInfo[] = [];
          const promises = rows.map(row => {
            return new Promise<void>((res, rej) => {
              this.db!.all(`PRAGMA index_info(${row.name})`, (err2, infoRows: any[]) => {
                if (err2) rej(err2);
                else {
                  indexes.push({
                    name: row.name,
                    unique: row.unique === 1,
                    columns: infoRows.map(ir => ir.name)
                  });
                  res();
                }
              });
            });
          });
          Promise.all(promises).then(() => resolve(indexes)).catch(reject);
        }
      });
    });
  }

  async getTableData(tableName: string, limit = 100, offset = 0, orderBy?: string, orderDir: 'ASC' | 'DESC' = 'ASC'): Promise<{ data: any[], total: number }> {
    if (!this.db) throw new Error('Not connected');
    return new Promise((resolve, reject) => {
      this.db!.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, countRow: any) => {
        if (err) return reject(err);
        let sql = `SELECT * FROM ${tableName}`;
        if (orderBy) {
          sql += ` ORDER BY ${orderBy} ${orderDir}`;
        }
        sql += ` LIMIT ${limit} OFFSET ${offset}`;
        
        this.db!.all(sql, (err, rows) => {
          if (err) reject(err);
          else resolve({ data: rows, total: countRow.count });
        });
      });
    });
  }

  async renameTable(oldName: string, newName: string): Promise<void> {
    if (!this.db) throw new Error('Not connected');
    return new Promise((resolve, reject) => {
      this.db!.run(`ALTER TABLE ${oldName} RENAME TO ${newName}`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async deleteTable(tableName: string): Promise<void> {
    if (!this.db) throw new Error('Not connected');
    return new Promise((resolve, reject) => {
      this.db!.run(`DROP TABLE ${tableName}`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async createTable(tableName: string, columns: ColumnInfo[], indexes?: IndexInfo[]): Promise<void> {
    if (!this.db) throw new Error('Not connected');
    const colDefs = columns.map(c => {
      let def = `${c.name} ${c.type}`;
      if (c.primaryKey) def += ' PRIMARY KEY';
      if (c.autoIncrement) def += ' AUTOINCREMENT';
      if (!c.nullable) def += ' NOT NULL';
      if (c.defaultValue !== undefined && c.defaultValue !== null) {
        def += ` DEFAULT ${typeof c.defaultValue === 'string' ? `'${c.defaultValue}'` : c.defaultValue}`;
      }
      return def;
    }).join(', ');

    const sql = `CREATE TABLE ${tableName} (${colDefs})`;
    return new Promise(async (resolve, reject) => {
      this.db!.serialize(async () => {
        this.db!.run(sql, async (err) => {
          if (err) return reject(err);
          
          if (indexes && indexes.length > 0) {
            try {
              for (const idx of indexes) {
                const unique = idx.unique ? 'UNIQUE' : '';
                const idxSql = `CREATE ${unique} INDEX ${idx.name} ON ${tableName} (${idx.columns.join(', ')})`;
                await new Promise<void>((res, rej) => this.db!.run(idxSql, (e) => e ? rej(e) : res()));
              }
              resolve();
            } catch (e) {
              reject(e);
            }
          } else {
            resolve();
          }
        });
      });
    });
  }

  async updateTableSchema(tableName: string, changes: {
    added: ColumnInfo[];
    modified: { oldName: string; column: ColumnInfo }[];
    removed: string[];
    indexes?: {
      added: IndexInfo[];
      removed: string[];
    };
  }): Promise<void> {
    if (!this.db) throw new Error('Not connected');
    
    return new Promise(async (resolve, reject) => {
      try {
        // 1. 处理添加列
        for (const col of changes.added) {
          const sql = `ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.type} ${col.nullable ? '' : 'NOT NULL'} ${col.defaultValue !== undefined ? `DEFAULT ${col.defaultValue}` : ''}`;
          await new Promise<void>((res, rej) => this.db!.run(sql, (err) => err ? rej(err) : res()));
        }
        
        // 2. 处理修改和删除列
        if (changes.modified.length > 0 || changes.removed.length > 0) {
          for (const mod of changes.modified) {
            if (mod.oldName !== mod.column.name) {
              await new Promise<void>((res, rej) => this.db!.run(`ALTER TABLE ${tableName} RENAME COLUMN ${mod.oldName} TO ${mod.column.name}`, (err) => err ? rej(err) : res()));
            }
          }
          
          for (const colName of changes.removed) {
            await new Promise<void>((res, rej) => this.db!.run(`ALTER TABLE ${tableName} DROP COLUMN ${colName}`, (err) => err ? rej(err) : res()));
          }
        }

        // 3. 处理索引
        if (changes.indexes) {
          for (const idxName of changes.indexes.removed) {
            await new Promise<void>((res, rej) => this.db!.run(`DROP INDEX IF EXISTS ${idxName}`, (err) => err ? rej(err) : res()));
          }
          for (const idx of changes.indexes.added) {
            const unique = idx.unique ? 'UNIQUE' : '';
            const sql = `CREATE ${unique} INDEX ${idx.name} ON ${tableName} (${idx.columns.join(', ')})`;
            await new Promise<void>((res, rej) => this.db!.run(sql, (err) => err ? rej(err) : res()));
          }
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  async exportDatabase(includeData: boolean): Promise<string> {
    if (!this.db) throw new Error('Not connected');
    const tables = await this.getTables();
    let sqlOutput = `-- AiSqlBoy SQLite Export\n-- Date: ${new Date().toLocaleString()}\n\nPRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n\n`;

    for (const table of tables) {
      const columns = await this.getTableColumns(table.name);
      // Get table creation SQL
      const createSql: any = await new Promise((res, rej) => {
        this.db!.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${table.name}'`, (err, row) => err ? rej(err) : res(row));
      });
      sqlOutput += `${createSql.sql};\n\n`;

      if (includeData) {
        const data = await new Promise<any[]>((res, rej) => {
          this.db!.all(`SELECT * FROM ${table.name}`, (err, rows) => err ? rej(err) : res(rows));
        });
        for (const row of data) {
          const keys = Object.keys(row);
          const values = keys.map(k => {
            const v = row[k];
            if (v === null) return 'NULL';
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
            return v;
          });
          sqlOutput += `INSERT INTO ${table.name} (${keys.join(', ')}) VALUES (${values.join(', ')});\n`;
        }
        sqlOutput += '\n';
      }
    }
    sqlOutput += `COMMIT;`;
    return sqlOutput;
  }

  async deleteDatabase(dbName: string): Promise<void> {
    throw new Error('SQLite 不支持直接删除数据库命令，请手动删除文件。');
  }

  async executeQuery(sql: string): Promise<{ data: any[], columns: string[], affectedRows?: number }> {
    if (!this.db) throw new Error('Not connected');
    return new Promise((resolve, reject) => {
      const isSelect = sql.trim().toUpperCase().startsWith('SELECT') || 
                       sql.trim().toUpperCase().startsWith('PRAGMA') ||
                       sql.trim().toUpperCase().startsWith('SHOW') ||
                       sql.trim().toUpperCase().startsWith('EXPLAIN');

      if (isSelect) {
        this.db!.all(sql, (err, rows) => {
          if (err) reject(err);
          else {
            const columns = rows.length > 0 ? Object.keys(rows[0] as any) : [];
            resolve({ data: rows, columns });
          }
        });
      } else {
        this.db!.run(sql, function(err) {
          if (err) reject(err);
          else {
            resolve({ 
              data: [{ 
                结果: '执行成功', 
                影响行数: this.changes,
                最后插入ID: this.lastID
              }], 
              columns: ['结果', '影响行数', '最后插入ID'],
              affectedRows: this.changes
            });
          }
        });
      }
    });
  }

  async ping(): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      this.db!.get('SELECT 1', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}