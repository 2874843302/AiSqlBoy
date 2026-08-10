import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let oracledbSingleton: any = null;
function getOracleDb(): any {
  if (!oracledbSingleton) {
    try {
      oracledbSingleton = require('oracledb');
    } catch {
      throw new Error('无法加载 oracledb，请执行 npm install oracledb 后重新打包');
    }
    oracledbSingleton.outFormat = oracledbSingleton.OUT_FORMAT_OBJECT;
    if (oracledbSingleton.CLOB != null) {
      oracledbSingleton.fetchAsString = [oracledbSingleton.CLOB];
    }
  }
  return oracledbSingleton;
}
import type { IDatabaseDriver, ConnectionConfig, IndexInfo } from './types';
import type { ColumnInfo, TableInfo } from '../../../shared/types';

export class OracleDriver implements IDatabaseDriver {
  private connection: any = null;
  private currentSchema = '';

  constructor(private config: ConnectionConfig) {}

  private fqTable(tableName: string): string {
    const o = this.currentSchema.replace(/"/g, '');
    const t = tableName.replace(/"/g, '');
    return `"${o}"."${t}"`;
  }

  async connect(): Promise<void> {
    const oracledb = getOracleDb();
    const svc = (this.config.database || '').trim();
    if (!svc) throw new Error('请填写 Oracle 服务名（Service Name，如 XEPDB1、ORCLPDB1）');
    const host = this.config.host || 'localhost';
    const port = this.config.port ?? 1521;
    const connectString = `${host}:${port}/${svc}`;
    this.connection = await oracledb.getConnection({
      user: this.config.user,
      password: this.config.password ?? '',
      connectString,
    });
    const ur = await this.connection.execute(`SELECT USER FROM DUAL`, [], { autoCommit: true });
    const urow = (ur.rows || [])[0] as Record<string, string>;
    this.currentSchema = String(urow?.USER ?? urow?.user ?? this.config.user ?? '');
  }

  async disconnect(): Promise<void> {
    try {
      await this.connection?.close();
    } catch {
      /* noop */
    }
    this.connection = null;
  }

  async getDatabases(): Promise<string[]> {
    if (!this.connection) throw new Error('Not connected');
    const sql = `
      SELECT owner FROM (
        SELECT DISTINCT owner FROM all_tables
        WHERE owner NOT IN (
          'SYS','SYSTEM','MDSYS','CTXSYS','XDB','ORDSYS','OLAPSYS','APPQOSSYS','ORDDATA',
          'LBACSYS','OUTLN','GSMADMIN_INTERNAL','DVSYS','DVF','AUDSYS','OJVMSYS','DBSNMP','DIP',
          'REMOTE_SCHEDULER_AGENT','SI_INFORMTN_SCHEMA','ORDPLUGINS','FLOWS_FILES','MDDATA',
          'SPATIAL_CSW_ADMIN_USR','SPATIAL_WFS_ADMIN_USR','WMSYS','EXFSYS'
        )
        ORDER BY owner
      ) WHERE ROWNUM <= 400`;
    try {
      const result = await this.connection.execute(sql, [], { autoCommit: true });
      const rows = (result.rows || []) as Record<string, string>[];
      const names = rows
        .map((r) => String(r.OWNER ?? r.owner ?? ''))
        .filter(Boolean);
      if (names.length > 0) return names;
    } catch {
      /*权限不足时回退 */
    }
    const u = (this.config.user || '').toUpperCase().replace(/"/g, '');
    return u ? [u] : [];
  }

  async useDatabase(dbName: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    await this.connection.execute(
      `ALTER SESSION SET CURRENT_SCHEMA = :schema`,
      { schema: dbName },
      { autoCommit: true }
    );
    this.currentSchema = dbName.replace(/"/g, '');
  }

  async getTables(): Promise<TableInfo[]> {
    if (!this.connection) throw new Error('Not connected');
    const res = await this.connection.execute(
      `SELECT table_name AS name FROM all_tables WHERE owner = :owner ORDER BY table_name`,
      { owner: this.currentSchema },
      { autoCommit: true }
    );
    const rows = (res.rows || []) as Record<string, string>[];
    return rows.map((r) => ({ name: String(r.NAME ?? r.name) }));
  }

  async getTableColumns(tableName: string): Promise<ColumnInfo[]> {
    if (!this.connection) throw new Error('Not connected');
    const owner = this.currentSchema;
    const tab = tableName.toUpperCase();
    const res = await this.connection.execute(
      `SELECT column_name, data_type, nullable, data_default
       FROM all_tab_columns
       WHERE owner = :owner AND table_name = :tab
       ORDER BY column_id`,
      { owner, tab },
      { autoCommit: true }
    );
    const rows = (res.rows || []) as any[];
    const pkRes = await this.connection.execute(
      `SELECT cols.column_name AS col
       FROM all_constraints cons
       JOIN all_cons_columns cols
         ON cons.owner = cols.owner AND cons.constraint_name = cols.constraint_name
       WHERE cons.constraint_type = 'P'
         AND cons.owner = :owner
         AND cons.table_name = :tab`,
      { owner, tab },
      { autoCommit: true }
    );
    const pkRows = (pkRes.rows || []) as Record<string, string>[];
    const pks = new Set(pkRows.map((r) => String(r.COL ?? r.col ?? '').toUpperCase()));

    return rows.map((row) => {
      const name = String(row.COLUMN_NAME ?? row.column_name ?? '');
      const nullable = String(row.NULLABLE ?? row.nullable ?? 'Y').toUpperCase() === 'Y';
      const defVal = row.DATA_DEFAULT ?? row.data_default;
      return {
        name,
        type: String(row.DATA_TYPE ?? row.data_type ?? ''),
        nullable,
        primaryKey: pks.has(name.toUpperCase()),
        defaultValue: defVal != null ? String(defVal) : undefined,
        autoIncrement: false,
      };
    });
  }

  async getTableIndexes(tableName: string): Promise<IndexInfo[]> {
    if (!this.connection) throw new Error('Not connected');
    const owner = this.currentSchema;
    const tab = tableName.toUpperCase();
    const res = await this.connection.execute(
      `SELECT i.index_name AS iname, i.uniqueness AS uniq, ic.column_name AS cname
       FROM all_indexes i
       JOIN all_ind_columns ic
         ON i.owner = ic.index_owner AND i.index_name = ic.index_name
       WHERE i.table_owner = :owner AND i.table_name = :tab
       ORDER BY i.index_name, ic.column_position`,
      { owner, tab },
      { autoCommit: true }
    );
    const indexMap = new Map<string, IndexInfo>();
    for (const row of res.rows || []) {
      const r = row as Record<string, string>;
      const name = String(r.INAME ?? r.iname ?? '');
      const col = String(r.CNAME ?? r.cname ?? '');
      const uniq = String(r.UNIQ ?? r.uniq ?? '').toUpperCase() === 'UNIQUE';
      if (!indexMap.has(name)) {
        indexMap.set(name, { name, unique: uniq, columns: [] });
      }
      indexMap.get(name)!.columns.push(col);
    }
    return Array.from(indexMap.values());
  }

  async getTableData(
    tableName: string,
    limit = 100,
    offset = 0,
    orderBy?: string,
    orderDir: 'ASC' | 'DESC' = 'ASC',
    filters?: Record<string, string>
  ): Promise<{ data: any[]; total: number }> {
    if (!this.connection) throw new Error('Not connected');
    const fq = this.fqTable(tableName);
    const filterEntries = filters ? Object.entries(filters).filter(([, v]) => v && v.trim()) : [];
    const whereClause = filterEntries.length > 0
      ? ' WHERE ' + filterEntries.map(([col, val]) => {
          const escapedCol = col.replace(/"/g, '""');
          const escapedVal = val.replace(/'/g, "''").toLowerCase();
          return `LOWER("${escapedCol}") LIKE '%${escapedVal}%'`;
        }).join(' AND ')
      : '';
    const countRes = await this.connection.execute(`SELECT COUNT(*) AS cnt FROM ${fq}${whereClause}`, [], { autoCommit: true });
    const countRow = (countRes.rows || [])[0] as Record<string, number>;
    const total = Number(countRow?.CNT ?? countRow?.cnt ?? 0);

    let sql = `SELECT * FROM ${fq}${whereClause}`;
    if (orderBy) {
      sql += ` ORDER BY "${orderBy.replace(/"/g, '')}" ${orderDir === 'DESC' ? 'DESC' : 'ASC'}`;
    } else {
      sql += ' ORDER BY 1';
    }
    sql += ` OFFSET :off ROWS FETCH NEXT :lim ROWS ONLY`;
    const dataRes = await this.connection.execute(sql, { off: offset, lim: limit }, { autoCommit: true });
    return { data: (dataRes.rows || []) as any[], total };
  }

  async renameTable(oldName: string, newName: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    const on = newName.replace(/"/g, '').toUpperCase();
    await this.connection.execute(`ALTER TABLE ${this.fqTable(oldName)} RENAME TO ${on}`, [], { autoCommit: true });
  }

  async deleteTable(tableName: string): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    await this.connection.execute(`DROP TABLE ${this.fqTable(tableName)}`, [], { autoCommit: true });
  }

  async createTable(tableName: string, columns: ColumnInfo[], indexes?: IndexInfo[]): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    const tn = tableName.replace(/"/g, '');
    const colDefs = columns.map((c) => {
      let def = `"${c.name.replace(/"/g, '')}" ${c.type}`;
      if (!c.nullable) def += ' NOT NULL';
      if (c.primaryKey) def += ' PRIMARY KEY';
      if (c.defaultValue !== undefined && c.defaultValue !== null && c.defaultValue !== '') {
        def += ` DEFAULT ${typeof c.defaultValue === 'string' ? `'${String(c.defaultValue).replace(/'/g, "''")}'` : c.defaultValue}`;
      }
      return def;
    });
    await this.connection.execute(`CREATE TABLE "${tn}" (${colDefs.join(', ')})`, [], { autoCommit: true });
    if (indexes && indexes.length > 0) {
      for (const idx of indexes) {
        const unique = idx.unique ? 'UNIQUE' : '';
        const cols = idx.columns.map((c) => `"${c.replace(/"/g, '')}"`).join(', ');
        await this.connection.execute(
          `CREATE ${unique} INDEX "${idx.name.replace(/"/g, '')}" ON "${tn}" (${cols})`,
          [],
          { autoCommit: true }
        );
      }
    }
  }

  async updateTableSchema(tableName: string, changes: any): Promise<void> {
    if (!this.connection) throw new Error('Not connected');
    const fq = this.fqTable(tableName);
    for (const colName of changes.removed || []) {
      await this.connection.execute(`ALTER TABLE ${fq} DROP COLUMN "${String(colName).replace(/"/g, '')}"`, [], { autoCommit: true });
    }
    for (const mod of changes.modified || []) {
      const col = mod.column;
      if (mod.oldName !== col.name) {
        await this.connection.execute(
          `ALTER TABLE ${fq} RENAME COLUMN "${String(mod.oldName).replace(/"/g, '')}" TO "${String(col.name).replace(/"/g, '')}"`,
          [],
          { autoCommit: true }
        );
      }
    }
    for (const col of changes.added || []) {
      await this.connection.execute(
        `ALTER TABLE ${fq} ADD ("${String(col.name).replace(/"/g, '')}" ${col.type}${col.nullable ? '' : ' NOT NULL'})`,
        [],
        { autoCommit: true }
      );
    }
  }

  async exportDatabase(includeData: boolean): Promise<string> {
    if (!this.connection) throw new Error('Not connected');
    const tables = await this.getTables();
    let sqlOutput = `-- AiSqlBoy Oracle Export\n-- Schema: ${this.currentSchema}\n-- Date: ${new Date().toLocaleString()}\n\n`;
    for (const table of tables) {
      const cols = await this.getTableColumns(table.name);
      const colDefs = cols.map((c) => `"${c.name}" ${c.type} ${c.nullable ? '' : 'NOT NULL'}`).join(', ');
      sqlOutput += `CREATE TABLE "${table.name}" (${colDefs});\n\n`;
      if (includeData) {
        const { data } = await this.getTableData(table.name, 10000, 0);
        for (const row of data) {
          const keys = Object.keys(row);
          const values = keys.map((k) => {
            const v = row[k];
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
            if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
            return String(v);
          });
          sqlOutput += `INSERT INTO "${table.name}" (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${values.join(', ')});\n`;
        }
        sqlOutput += '\n';
      }
    }
    return sqlOutput;
  }

  async deleteDatabase(_dbName: string): Promise<void> {
    throw new Error('Oracle 不支持在此删除整个 schema，请在数据库中手动操作');
  }

  async executeQuery(sql: string): Promise<{ data: any[]; columns: string[]; affectedRows?: number }> {
    if (!this.connection) throw new Error('Not connected');
    try {
      const result = await this.connection.execute(sql, [], { autoCommit: true });
      if (result.rows && result.metaData) {
        const columns = (result.metaData as any[]).map((m: any) => m.name);
        return { data: result.rows as any[], columns };
      }
      return {
        data: [
          {
            结果: '执行成功',
            影响行数: result.rowsAffected ?? 0,
          },
        ],
        columns: ['结果', '影响行数'],
        affectedRows: result.rowsAffected ?? 0,
      };
    } catch (error: any) {
      const isConn =
        error.message?.includes('closed') ||
        error.message?.includes('ORA-03114') ||
        error.message?.includes('not connected');
      if (isConn) {
        try {
          await this.connect();
          const result = await this.connection.execute(sql, [], { autoCommit: true });
          if (result.rows && result.metaData) {
            const columns = (result.metaData as any[]).map((m: any) => m.name);
            return { data: result.rows as any[], columns };
          }
          return {
            data: [{ 结果: '执行成功', 影响行数: result.rowsAffected ?? 0 }],
            columns: ['结果', '影响行数'],
            affectedRows: result.rowsAffected ?? 0,
          };
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
      await this.connection.execute('SELECT 1 FROM DUAL', [], { autoCommit: true });
    } catch {
      await this.connect();
    }
  }
}