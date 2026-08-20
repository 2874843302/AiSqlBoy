import mysql from 'mysql2/promise';
import type { IDatabaseDriver, ConnectionConfig, ColumnInfo, IndexInfo } from './types';
import type { TableInfo } from '../../../shared/types';

export class MySQLDriver implements IDatabaseDriver {
  private connection: mysql.Connection | null = null;
  onConnectionLost?: (message: string) => void;
  constructor(private config: ConnectionConfig) {}

  private escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
  }

  private buildMySqlDefaultClause(col: ColumnInfo): string {
    if (col.defaultValue === null || col.defaultValue === undefined) return '';

    let raw = String(col.defaultValue).trim();
    if (!raw) return ` DEFAULT ''`;

    const typeUpper = (col.type || '').toUpperCase();
    const isTimestampLike = typeUpper.includes('TIMESTAMP') || typeUpper.includes('DATETIME');
    if (isTimestampLike && /^CURRENT_TIME(?:\(\))?$/i.test(raw)) {
      // MySQL TIMESTAMP/DATETIME 默认值应为 CURRENT_TIMESTAMP，而非 CURRENT_TIME
      raw = 'CURRENT_TIMESTAMP';
    }

    if (/^NULL$/i.test(raw)) return ' DEFAULT NULL';
    if (/^-?\d+(\.\d+)?$/.test(raw)) return ` DEFAULT ${raw}`;
    if (/^(CURRENT_TIMESTAMP(?:\(\d+\))?|NOW\(\)|CURRENT_DATE(?:\(\))?|CURRENT_TIME(?:\(\))?|LOCALTIME(?:\(\))?|LOCALTIMESTAMP(?:\(\))?)$/i.test(raw)) {
      return ` DEFAULT ${raw.toUpperCase()}`;
    }

    return ` DEFAULT '${this.escapeSqlString(raw)}'`;
  }

  async connect() {
    this.connection = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database, // 可以为空
      multipleStatements: true, // 允许执行多条 SQL 语句
      supportBigNumbers: true,
      bigNumberStrings: true
    });
    // 捕获底层连接的 error 事件：服务端断开/网络中断时不再抛未捕获异常炸主进程
    const underlying: any = (this.connection as any).connection ?? this.connection;
    underlying.on('error', (err: any) => {
      console.error('[MySQL] connection error:', err?.message);
      this.onConnectionLost?.(err?.message || '连接已断开');
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

async getTableData(tableName: string, limit = 100, offset = 0, orderBy?: string, orderDir: 'ASC' | 'DESC' = 'ASC', filters?: Record<string, string>): Promise<{ data: any[], total: number }> {
if (!this.connection) throw new Error('Not connected');
const filterEntries = filters ? Object.entries(filters).filter(([, v]) => v && v.trim()) : [];
const whereClause = filterEntries.length > 0
? ' WHERE ' + filterEntries.map(([col, val]) => {
const escapedCol = col.replace(/`/g, '``');
const escapedVal = val.replace(/'/g, "''");
return `\`${escapedCol}\` LIKE '%${escapedVal}%'`;
}).join(' AND ')
: '';
const [[{ total }]] = await this.connection.query(`SELECT COUNT(*) as total FROM ${tableName}${whereClause}`) as any;

let sql = `SELECT * FROM ${tableName}${whereClause}`;
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
      def += this.buildMySqlDefaultClause(c);
      if (c.autoIncrement) def += ' AUTO_INCREMENT';
      if (c.primaryKey) def += ' PRIMARY KEY';
      if (c.comment) def += ` COMMENT '${this.escapeSqlString(String(c.comment))}'`;
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
      const definition = `${col.name} ${col.type} ${col.nullable ? 'NULL' : 'NOT NULL'}${this.buildMySqlDefaultClause(col)} ${col.autoIncrement ? 'AUTO_INCREMENT' : ''} ${col.comment ? `COMMENT '${this.escapeSqlString(String(col.comment))}'` : ''}`;
      if (mod.oldName !== col.name) {
        sqlParts.push(`CHANGE COLUMN ${mod.oldName} ${definition}`);
      } else {
        sqlParts.push(`MODIFY COLUMN ${definition}`);
      }
    }

    // 3. 处理添加列
    for (const col of changes.added) {
      const definition = `${col.name} ${col.type} ${col.nullable ? 'NULL' : 'NOT NULL'}${this.buildMySqlDefaultClause(col)} ${col.autoIncrement ? 'AUTO_INCREMENT' : ''} ${col.comment ? `COMMENT '${this.escapeSqlString(String(col.comment))}'` : ''}`;
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

  private processResults(results: any, fields: any): { data: any[], columns: string[], affectedRows?: number } {
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
          columns: allData.length > 0 ? Object.keys(allData[0]) : ['结果'],
          affectedRows: (multiResults as any[]).reduce((sum, res) => sum + (res.affectedRows !== undefined ? res.affectedRows : 0), 0)
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
        columns: ['结果', '影响行数', '插入ID', '信息'],
        affectedRows: header.affectedRows || 0
      };
    }
    
    // 查询语句
    const fieldArray = Array.isArray(fields) ? fields : [];
    const columns = fieldArray.map(f => (f && typeof f === 'object' ? f.name : '未知列')) || [];
    return { data: Array.isArray(results) ? results : [], columns };
  }

  async executeQuery(sql: string): Promise<{ data: any[], columns: string[], affectedRows?: number }> {
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