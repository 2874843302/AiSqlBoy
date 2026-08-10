import pg from 'pg';
const { Client } = pg;
import type { IDatabaseDriver, ConnectionConfig, ColumnInfo, IndexInfo } from './types';
import type { TableInfo } from '../../../shared/types';

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
        column_default as "defaultValue",
        col_description((quote_ident(table_schema) || '.' || quote_ident(table_name))::regclass::oid, ordinal_position) as comment
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
      autoIncrement: row.defaultValue?.includes('nextval'),
      comment: row.comment || ''
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

  async getTableData(tableName: string, limit = 100, offset = 0, orderBy?: string, orderDir: 'ASC' | 'DESC' = 'ASC', filters?: Record<string, string>): Promise<{ data: any[], total: number }> {
    if (!this.client) throw new Error('Not connected');
    const filterEntries = filters ? Object.entries(filters).filter(([, v]) => v && v.trim()) : [];
    const whereClause = filterEntries.length > 0
      ? ' WHERE ' + filterEntries.map(([col, val]) => {
          const escapedCol = col.replace(/"/g, '""');
          const escapedVal = val.replace(/'/g, "''");
          return `CAST("${escapedCol}" AS TEXT) ILIKE '%${escapedVal}%'`;
        }).join(' AND ')
      : '';
    const countRes = await this.client.query(`SELECT COUNT(*) as total FROM "${tableName}"${whereClause}`);
    const total = parseInt(countRes.rows[0].total);

    let sql = `SELECT * FROM "${tableName}"${whereClause}`;
    if (orderBy) {
      sql += ` ORDER BY "${orderBy.replace(/"/g, '""')}" ${orderDir}`;
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

    for (const col of columns) {
      if (!col.comment) continue;
      const escapedComment = String(col.comment).replace(/'/g, "''");
      await this.client.query(`COMMENT ON COLUMN "${tableName}"."${col.name}" IS '${escapedComment}'`);
    }

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
      const targetColumnName = mod.column.name;
      // 1. 重命名列（如果名称变了）
      if (mod.oldName !== mod.column.name) {
        await this.client.query(`ALTER TABLE "${tableName}" RENAME COLUMN "${mod.oldName}" TO "${mod.column.name}"`);
      }
      // 2. 修改字段类型
      if (mod.column.type) {
        await this.client.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${targetColumnName}" TYPE ${mod.column.type}`);
      }
      // 3. 修改可空性（NOT NULL 约束）
      if (mod.column.nullable) {
        await this.client.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${targetColumnName}" DROP NOT NULL`);
      } else {
        await this.client.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${targetColumnName}" SET NOT NULL`);
      }
      // 4. 修改默认值
      if (mod.column.defaultValue !== undefined && mod.column.defaultValue !== null && mod.column.defaultValue !== '') {
        await this.client.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${targetColumnName}" SET DEFAULT ${mod.column.defaultValue}`);
      } else {
        await this.client.query(`ALTER TABLE "${tableName}" ALTER COLUMN "${targetColumnName}" DROP DEFAULT`);
      }
      // 5. 修改注释
      if (Object.prototype.hasOwnProperty.call(mod.column, 'comment')) {
        const escapedComment = mod.column.comment ? String(mod.column.comment).replace(/'/g, "''") : null;
        if (escapedComment === null) {
          await this.client.query(`COMMENT ON COLUMN "${tableName}"."${targetColumnName}" IS NULL`);
        } else {
          await this.client.query(`COMMENT ON COLUMN "${tableName}"."${targetColumnName}" IS '${escapedComment}'`);
        }
      }
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

  async executeQuery(sql: string): Promise<{ data: any[], columns: string[], affectedRows?: number }> {
    if (!this.client) throw new Error('Not connected');
    try {
      const res = await this.client.query(sql);
      
      if (Array.isArray(res)) {
        // 多条语句执行
        const lastRes = res[res.length - 1];
        return { 
          data: lastRes.rows, 
          columns: lastRes.fields?.map(f => f.name) || [],
          affectedRows: lastRes.rowCount ?? undefined
        };
      }

      if (res.command !== 'SELECT' && res.command !== 'SHOW') {
        return {
          data: [{
            结果: '执行成功',
            命令: res.command,
            影响行数: res.rowCount || 0
          }],
          columns: ['结果', '命令', '影响行数'],
          affectedRows: res.rowCount || 0
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
              columns: ['结果', '命令', '影响行数'],
              affectedRows: finalRes.rowCount || 0
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