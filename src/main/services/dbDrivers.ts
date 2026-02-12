import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');
import type { Database } from 'sqlite3';

import mysql from 'mysql2/promise';
import pg from 'pg';
const { Client } = pg;
import { createClient } from 'redis';
import { ConnectionConfig, TableInfo, ColumnInfo, IndexInfo } from '../../shared/types';

export interface IDatabaseDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getDatabases(): Promise<string[]>;
  useDatabase(dbName: string): Promise<void>;
  getTables(): Promise<TableInfo[]>;
  getTableColumns(tableName: string): Promise<ColumnInfo[]>;
  getTableIndexes(tableName: string): Promise<IndexInfo[]>;
  getTableData(tableName: string, limit?: number, offset?: number, orderBy?: string, orderDir?: 'ASC' | 'DESC'): Promise<{ data: any[], total: number }>;
  renameTable(oldName: string, newName: string): Promise<void>;
  deleteTable(tableName: string): Promise<void>;
  createTable(tableName: string, columns: ColumnInfo[], indexes?: IndexInfo[]): Promise<void>;
  updateTableSchema(tableName: string, changes: {
    added: ColumnInfo[];
    modified: { oldName: string; column: ColumnInfo }[];
    removed: string[];
    indexes?: {
      added: IndexInfo[];
      removed: string[];
    };
  }): Promise<void>;
  exportDatabase(includeData: boolean): Promise<string>;
  deleteDatabase(dbName: string): Promise<void>;
  executeQuery(sql: string): Promise<{ data: any[], columns: string[] }>;
  ping(): Promise<void>;
}

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

  async executeQuery(sql: string): Promise<{ data: any[], columns: string[] }> {
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
              columns: ['结果', '影响行数', '最后插入ID'] 
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

export class MySQLDriver implements IDatabaseDriver {
  private connection: mysql.Connection | null = null;
  constructor(private config: ConnectionConfig) {}

  async connect() {
    this.connection = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database, // 可以为空
      multipleStatements: true // 允许执行多条 SQL 语句
    });
  }

  async disconnect() {
    await this.connection?.end();
  }

  async getDatabases(): Promise<string[]> {
    if (!this.connection) throw new Error('Not connected');
    const [rows] = await this.connection.query('SHOW DATABASES');
    return (rows as any[]).map(row => Object.values(row)[0] as string);
  }

  async useDatabase(dbName: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    await this.connection.query(`USE ${dbName}`);
  }

  async getTables(): Promise<TableInfo[]> {
    if (!this.connection) throw new Error('Not connected');
    const [rows] = await this.connection.query('SHOW TABLES');
    return (rows as any[]).map(row => ({
      name: Object.values(row)[0] as string
    }));
  }

  async getTableColumns(tableName: string): Promise<ColumnInfo[]> {
    if (!this.connection) throw new Error('Not connected');
    const [rows] = await this.connection.query(`SHOW FULL COLUMNS FROM ${tableName}`);
    return (rows as any[]).map(row => ({
      name: row.Field,
      type: row.Type,
      nullable: row.Null === 'YES',
      primaryKey: row.Key === 'PRI',
      defaultValue: row.Default,
      autoIncrement: row.Extra.includes('auto_increment'),
      comment: row.Comment
    }));
  }

  async getTableIndexes(tableName: string): Promise<IndexInfo[]> {
    if (!this.connection) throw new Error('Not connected');
    const [rows] = await this.connection.query(`SHOW INDEX FROM ${tableName}`);
    const indexMap = new Map<string, IndexInfo>();

    for (const row of rows as any[]) {
      const name = row.Key_name;
      if (!indexMap.has(name)) {
        indexMap.set(name, {
          name,
          unique: row.Non_unique === 0,
          columns: [],
          type: row.Index_type
        });
      }
      indexMap.get(name)!.columns.push(row.Column_name);
    }
    return Array.from(indexMap.values());
  }

  async getTableData(tableName: string, limit = 100, offset = 0, orderBy?: string, orderDir: 'ASC' | 'DESC' = 'ASC'): Promise<{ data: any[], total: number }> {
    if (!this.connection) throw new Error('Not connected');
    const [[{ total }]] = await this.connection.query(`SELECT COUNT(*) as total FROM ${tableName}`) as any;
    
    let sql = `SELECT * FROM ${tableName}`;
    if (orderBy) {
      sql += ` ORDER BY ${orderBy} ${orderDir}`;
    }
    sql += ` LIMIT ${limit} OFFSET ${offset}`;
    
    const [rows] = await this.connection.query(sql);
    return { data: rows as any[], total };
  }

  async renameTable(oldName: string, newName: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    await this.connection.query(`RENAME TABLE ${oldName} TO ${newName}`);
  }

  async deleteTable(tableName: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    await this.connection.query(`DROP TABLE ${tableName}`);
  }

  async createTable(tableName: string, columns: ColumnInfo[], indexes?: IndexInfo[]): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    const colDefs = columns.map(c => {
      let def = `${c.name} ${c.type}`;
      if (!c.nullable) def += ' NOT NULL';
      if (c.defaultValue !== undefined && c.defaultValue !== null) {
        def += ` DEFAULT '${c.defaultValue}'`;
      }
      if (c.autoIncrement) def += ' AUTO_INCREMENT';
      if (c.primaryKey) def += ' PRIMARY KEY';
      if (c.comment) def += ` COMMENT '${c.comment}'`;
      return def;
    });

    if (indexes && indexes.length > 0) {
      for (const idx of indexes) {
        const unique = idx.unique ? 'UNIQUE' : '';
        const type = idx.type ? `USING ${idx.type}` : '';
        colDefs.push(`${unique} INDEX ${idx.name} (${idx.columns.join(', ')}) ${type}`);
      }
    }

    const sql = `CREATE TABLE ${tableName} (${colDefs.join(', ')})`;
    await this.connection.query(sql);
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
    if (!this.connection) throw new Error('Not connected');

    const sqlParts: string[] = [];

    // 1. 处理删除列
    for (const colName of changes.removed) {
      sqlParts.push(`DROP COLUMN ${colName}`);
    }

    // 2. 处理修改列
    for (const mod of changes.modified) {
      const col = mod.column;
      const definition = `${col.name} ${col.type} ${col.nullable ? 'NULL' : 'NOT NULL'} ${col.defaultValue !== null && col.defaultValue !== undefined ? `DEFAULT '${col.defaultValue}'` : ''} ${col.autoIncrement ? 'AUTO_INCREMENT' : ''} ${col.comment ? `COMMENT '${col.comment}'` : ''}`;
      if (mod.oldName !== col.name) {
        sqlParts.push(`CHANGE COLUMN ${mod.oldName} ${definition}`);
      } else {
        sqlParts.push(`MODIFY COLUMN ${definition}`);
      }
    }

    // 3. 处理添加列
    for (const col of changes.added) {
      const definition = `${col.name} ${col.type} ${col.nullable ? 'NULL' : 'NOT NULL'} ${col.defaultValue !== null && col.defaultValue !== undefined ? `DEFAULT '${col.defaultValue}'` : ''} ${col.autoIncrement ? 'AUTO_INCREMENT' : ''} ${col.comment ? `COMMENT '${col.comment}'` : ''}`;
      sqlParts.push(`ADD COLUMN ${definition}`);
    }

    // 4. 处理索引
    if (changes.indexes) {
      for (const idxName of changes.indexes.removed) {
        if (idxName === 'PRIMARY') {
          sqlParts.push(`DROP PRIMARY KEY`);
        } else {
          sqlParts.push(`DROP INDEX ${idxName}`);
        }
      }
      for (const idx of changes.indexes.added) {
        const unique = idx.unique ? 'UNIQUE' : '';
        const type = idx.type ? `USING ${idx.type}` : '';
        sqlParts.push(`ADD ${unique} INDEX ${idx.name} (${idx.columns.join(', ')}) ${type}`);
      }
    }

    if (sqlParts.length > 0) {
      const sql = `ALTER TABLE ${tableName} ${sqlParts.join(', ')}`;
      await this.connection.query(sql);
    }
  }

  async exportDatabase(includeData: boolean): Promise<string> {
    if (!this.connection) throw new Error('Not connected');
    const tables = await this.getTables();
    let sqlOutput = `-- AiSqlBoy MySQL Export\n-- Date: ${new Date().toLocaleString()}\n\nSET FOREIGN_KEY_CHECKS=0;\n\n`;

    for (const table of tables) {
      const [createRes]: any = await this.connection.query(`SHOW CREATE TABLE ${table.name}`);
      sqlOutput += `${createRes[0]['Create Table']};\n\n`;

      if (includeData) {
        const [rows]: any = await this.connection.query(`SELECT * FROM ${table.name}`);
        for (const row of rows) {
          const keys = Object.keys(row);
          const values = keys.map(k => {
            const v = row[k];
            if (v === null) return 'NULL';
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
            if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
            return v;
          });
          sqlOutput += `INSERT INTO ${table.name} (${keys.join(', ')}) VALUES (${values.join(', ')});\n`;
        }
        sqlOutput += '\n';
      }
    }
    sqlOutput += `SET FOREIGN_KEY_CHECKS=1;`;
    return sqlOutput;
  }

  async deleteDatabase(dbName: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    await this.connection.query(`DROP DATABASE ${dbName}`);
  }

  private processResults(results: any, fields: any): { data: any[], columns: string[] } {
    // 1. 处理多语句执行的情况
    // 在多语句模式下，如果执行的是多条非查询语句，fields 可能是 undefined 或者一个包含多个 undefined 的数组
    if (Array.isArray(results) && (fields === undefined || Array.isArray(fields))) {
      // 检查是否真的有多个结果
      // 注意：有时单条语句也可能被驱动包装成数组，这里通过 results 的结构来判断
      const isMulti = results.length > 0 && 
                     (results[0]?.constructor?.name === 'ResultSetHeader' || 
                      results[0]?.constructor?.name === 'OkPacket' || 
                      Array.isArray(results[0]));

      if (isMulti) {
        const allData: any[] = [];
        const multiResults = results as any[];
        // fields 可能为 undefined (如果全是 DML)，或者为数组
        const multiFields = Array.isArray(fields) ? fields : [];

        multiResults.forEach((res, index) => {
          const f = multiFields[index];
          if (!f || !Array.isArray(f)) {
            // DDL/DML 语句 (没有 fields)
            allData.push({
              查询编号: index + 1,
              结果: '执行成功',
              影响行数: res.affectedRows !== undefined ? res.affectedRows : (res.length || 0),
              信息: res.info || res.message || ''
            });
          } else {
            // SELECT 语句 (有 fields)
            allData.push({
              查询编号: index + 1,
              结果: `返回了 ${res.length} 条数据`,
              提示: '多语句模式下暂不支持直接展示 SELECT 数据'
            });
          }
        });

        return {
          data: allData,
          columns: allData.length > 0 ? Object.keys(allData[0]) : ['结果']
        };
      }
    }

    // 2. 单条语句执行的情况
    // 如果没有 fields，说明是非查询语句 (INSERT, UPDATE, DELETE, CREATE, DROP 等)
    if (!fields || (Array.isArray(fields) && fields.length === 0)) {
      const header = results as any;
      return { 
        data: [{ 
          结果: '执行成功', 
          影响行数: header.affectedRows || 0,
          插入ID: header.insertId || 0,
          信息: header.info || header.message || ''
        }], 
        columns: ['结果', '影响行数', '插入ID', '信息'] 
      };
    }
    
    // 查询语句
    const fieldArray = Array.isArray(fields) ? fields : [];
    const columns = fieldArray.map(f => (f && typeof f === 'object' ? f.name : '未知列')) || [];
    return { data: Array.isArray(results) ? results : [], columns };
  }

  async executeQuery(sql: string): Promise<{ data: any[], columns: string[] }> {
    if (!this.connection) throw new Error('Not connected');
    try {
      const [results, fields] = await this.connection.query(sql);
      return this.processResults(results, fields);
    } catch (error: any) {
      // 增强自动重连逻辑
      const isConnectionError = 
        error.code === 'PROTOCOL_CONNECTION_LOST' || 
        error.code === 'ECONNRESET' || 
        error.code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR' ||
        error.message.includes('closed') ||
        error.message.includes('connection lost');

      if (isConnectionError) {
        try {
          await this.connect();
          const [results, fields] = await this.connection!.query(sql);
          return this.processResults(results, fields);
        } catch (reconnectError: any) {
          throw new Error(`连接已断开且重连失败: ${reconnectError.message}`);
        }
      }
      throw error;
    }
  }

  async ping(): Promise<void> {
    if (!this.connection) return;
    try {
      await this.connection.query('SELECT 1');
    } catch (error: any) {
      // 如果 ping 失败，尝试重连
      await this.connect();
    }
  }
}

export class PostgreSQLDriver implements IDatabaseDriver {
  private client: pg.Client | null = null;
  constructor(private config: ConnectionConfig) {}

  async connect() {
    this.client = new Client({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database
    });
    await this.client.connect();
  }

  async disconnect() {
    await this.client?.end();
  }

  async getDatabases(): Promise<string[]> {
    if (!this.client) throw new Error('Not connected');
    const res = await this.client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
    return res.rows.map(row => row.datname);
  }

  async useDatabase(dbName: string): Promise<void> {
    // pg 客户端连接时就已经指定了数据库，不支持像 MySQL 那样动态切换数据库而不重连
    // 但我们可以通过重新连接来实现
    if (this.config.database === dbName) return;
    
    await this.disconnect();
    this.config.database = dbName;
    await this.connect();
  }

  async getTables(): Promise<TableInfo[]> {
    if (!this.client) throw new Error('Not connected');
    const res = await this.client.query("SELECT tablename as name FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'");
    return res.rows;
  }

  async getTableColumns(tableName: string): Promise<ColumnInfo[]> {
    if (!this.client) throw new Error('Not connected');
    const res = await this.client.query(`
      SELECT 
        column_name as name, 
        data_type as type, 
        is_nullable as nullable, 
        column_default as "defaultValue"
      FROM information_schema.columns 
      WHERE table_name = $1
    `, [tableName]);

    // 获取主键信息
    const pkRes = await this.client.query(`
      SELECT a.attname
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary;
    `, [tableName]);
    const pks = new Set(pkRes.rows.map(r => r.attname));

    return res.rows.map(row => ({
      name: row.name,
      type: row.type,
      nullable: row.nullable === 'YES',
      primaryKey: pks.has(row.name),
      defaultValue: row.defaultValue,
      autoIncrement: row.defaultValue?.includes('nextval')
    }));
  }

  async getTableIndexes(tableName: string): Promise<IndexInfo[]> {
    if (!this.client) throw new Error('Not connected');
    const res = await this.client.query(`
      SELECT
        i.relname as name,
        ix.indisunique as unique,
        a.attname as column_name
      FROM
        pg_class t,
        pg_class i,
        pg_index ix,
        pg_attribute a
      WHERE
        t.oid = ix.indrelid
        AND i.oid = ix.indexrelid
        AND a.attrelid = t.oid
        AND a.attnum = ANY(ix.indkey)
        AND t.relkind = 'r'
        AND t.relname = $1
    `, [tableName]);

    const indexMap = new Map<string, IndexInfo>();
    for (const row of res.rows) {
      if (!indexMap.has(row.name)) {
        indexMap.set(row.name, {
          name: row.name,
          unique: row.unique,
          columns: []
        });
      }
      indexMap.get(row.name)!.columns.push(row.column_name);
    }
    return Array.from(indexMap.values());
  }

  async getTableData(tableName: string, limit = 100, offset = 0, orderBy?: string, orderDir: 'ASC' | 'DESC' = 'ASC'): Promise<{ data: any[], total: number }> {
    if (!this.client) throw new Error('Not connected');
    const countRes = await this.client.query(`SELECT COUNT(*) as total FROM "${tableName}"`);
    const total = parseInt(countRes.rows[0].total);

    let sql = `SELECT * FROM "${tableName}"`;
    if (orderBy) {
      sql += ` ORDER BY "${orderBy}" ${orderDir}`;
    }
    sql += ` LIMIT ${limit} OFFSET ${offset}`;
    
    const res = await this.client.query(sql);
    return { data: res.rows, total };
  }

  async renameTable(oldName: string, newName: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    await this.client.query(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
  }

  async deleteTable(tableName: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    await this.client.query(`DROP TABLE "${tableName}"`);
  }

  async createTable(tableName: string, columns: ColumnInfo[], indexes?: IndexInfo[]): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    const colDefs = columns.map(c => {
      let def = `"${c.name}" ${c.type}`;
      if (c.primaryKey) def += ' PRIMARY KEY';
      if (!c.nullable) def += ' NOT NULL';
      if (c.defaultValue !== undefined && c.defaultValue !== null) {
        def += ` DEFAULT ${c.defaultValue}`;
      }
      return def;
    });

    const sql = `CREATE TABLE "${tableName}" (${colDefs.join(', ')})`;
    await this.client.query(sql);

    if (indexes && indexes.length > 0) {
      for (const idx of indexes) {
        const unique = idx.unique ? 'UNIQUE' : '';
        const idxSql = `CREATE ${unique} INDEX "${idx.name}" ON "${tableName}" (${idx.columns.map(c => `"${c}"`).join(', ')})`;
        await this.client.query(idxSql);
      }
    }
  }

  async updateTableSchema(tableName: string, changes: any): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    // pg 的 ALTER TABLE 语法与 MySQL 略有不同，但核心逻辑相似
    // 为简化实现，这里仅处理添加、删除和重命名
    for (const col of changes.removed) {
      await this.client.query(`ALTER TABLE "${tableName}" DROP COLUMN "${col}"`);
    }

    for (const mod of changes.modified) {
      if (mod.oldName !== mod.column.name) {
        await this.client.query(`ALTER TABLE "${tableName}" RENAME COLUMN "${mod.oldName}" TO "${mod.column.name}"`);
      }
      // 这里可以扩展修改类型、可空性等
    }

    for (const col of changes.added) {
      await this.client.query(`ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${col.type} ${col.nullable ? '' : 'NOT NULL'}`);
    }
  }

  async exportDatabase(includeData: boolean): Promise<string> {
    if (!this.client) throw new Error('Not connected');
    const tables = await this.getTables();
    let sqlOutput = `-- AiSqlBoy PostgreSQL Export\n-- Date: ${new Date().toLocaleString()}\n\n`;

    for (const table of tables) {
      // 这里的 CREATE TABLE 获取比较复杂，简单模拟一下
      const cols = await this.getTableColumns(table.name);
      const colDefs = cols.map(c => `"${c.name}" ${c.type} ${c.nullable ? '' : 'NOT NULL'}`).join(', ');
      sqlOutput += `CREATE TABLE "${table.name}" (${colDefs});\n\n`;

      if (includeData) {
        const res = await this.client.query(`SELECT * FROM "${table.name}"`);
        for (const row of res.rows) {
          const keys = Object.keys(row);
          const values = keys.map(k => {
            const v = row[k];
            if (v === null) return 'NULL';
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
            return v;
          });
          sqlOutput += `INSERT INTO "${table.name}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${values.join(', ')});\n`;
        }
        sqlOutput += '\n';
      }
    }
    return sqlOutput;
  }

  async deleteDatabase(dbName: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    await this.client.query(`DROP DATABASE "${dbName}"`);
  }

  async executeQuery(sql: string): Promise<{ data: any[], columns: string[] }> {
    if (!this.client) throw new Error('Not connected');
    try {
      const res = await this.client.query(sql);
      
      if (Array.isArray(res)) {
        // 多条语句执行
        const lastRes = res[res.length - 1];
        return { 
          data: lastRes.rows, 
          columns: lastRes.fields?.map(f => f.name) || [] 
        };
      }

      if (res.command !== 'SELECT' && res.command !== 'SHOW') {
        return {
          data: [{
            结果: '执行成功',
            命令: res.command,
            影响行数: res.rowCount || 0
          }],
          columns: ['结果', '命令', '影响行数']
        };
      }

      return { 
        data: res.rows, 
        columns: res.fields?.map(f => f.name) || [] 
      };
    } catch (error: any) {
      // PostgreSQL 自动重连处理
      const isConnectionError = 
        error.message.includes('closed') || 
        error.message.includes('terminating') || 
        error.message.includes('connection lost') ||
        error.code === 'ECONNRESET';

      if (isConnectionError) {
        try {
          await this.connect();
          const res = await this.client!.query(sql);
          const finalRes = Array.isArray(res) ? res[res.length - 1] : res;
          if (finalRes.command !== 'SELECT' && finalRes.command !== 'SHOW') {
            return {
              data: [{ 结果: '执行成功', 命令: finalRes.command, 影响行数: finalRes.rowCount || 0 }],
              columns: ['结果', '命令', '影响行数']
            };
          }
          return { data: finalRes.rows, columns: finalRes.fields?.map(f => f.name) || [] };
        } catch (reconnectError: any) {
          throw new Error(`连接已断开且重连失败: ${reconnectError.message}`);
        }
      }
      throw error;
    }
  }

  async ping(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.query('SELECT 1');
    } catch (error: any) {
      await this.connect();
    }
  }
}

export class RedisDriver implements IDatabaseDriver {
  private client: any = null;
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
    await this.client.connect();
  }

  async disconnect() {
    await this.client?.quit();
  }

  async getDatabases(): Promise<string[]> {
    // Redis 默认有 16 个数据库 (0-15)
    return Array.from({ length: 16 }, (_, i) => i.toString());
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
    
    const keys = await this.client.keys('*');
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
    const keys = await this.client.keys('*');
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

  async executeQuery(sql: string): Promise<{ data: any[], columns: string[] }> {
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
