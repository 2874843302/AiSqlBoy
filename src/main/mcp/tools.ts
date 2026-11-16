/**
 * MCP 工具层（与传输方式解耦）
 *
 * 无论走本地 stdio 桥还是未来的远程 HTTP 传输，工具定义与执行逻辑都放在这里。
 * 安全策略：默认全只读，仅在设置项 mcp_allow_write 开启且连接本身非只读时才注册 execute_sql。
 */

import {
  classifySql,
  hasMultipleStatements,
  checkAllowedDatabaseSql,
  ensureSelectLimit,
  buildImpactPreviewSql,
  friendlyDbError,
} from '../../shared/sqlSecurity';
import { MCP_DEFAULTS, MCP_SETTING_KEYS } from '../../shared/mcpSettings';
import { internalDB } from '../services/internalDB';
import type { ConnectionConfig } from '../../shared/types';
import { driverPool } from './driverPool';

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

const MAX_CELL_CHARS = 120;

/** Redis 只读命令前缀（未开启写权限时放行） */
const REDIS_READONLY_PREFIXES = [
  'GET', 'MGET', 'STRLEN', 'EXISTS', 'TYPE', 'TTL', 'PTTL', 'SCAN', 'KEYS',
  'HGET', 'HGETALL', 'HKEYS', 'HVALS', 'HLEN', 'HMGET', 'HEXISTS',
  'LRANGE', 'LLEN', 'LINDEX', 'SMEMBERS', 'SCARD', 'SISMEMBER',
  'ZRANGE', 'ZRANGEBYSCORE', 'ZCARD', 'ZSCORE', 'ZRANK',
  'DBSIZE', 'INFO', 'PING', 'SELECT',
];

/** 拒绝类错误：作为工具结果返回给模型，让它自己纠正而不是让链路报错 */
class ToolRejection extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolRejection';
  }
}

function cell(value: any): string {
  if (value === null || value === undefined) return 'NULL';
  let text: string;
  if (typeof value === 'object') {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  } else {
    text = String(value);
  }
  text = text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  return text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS)}…` : text;
}

function formatTable(
  columns: string[],
  rows: any[],
  options: { maxRows: number; total?: number } = { maxRows: MCP_DEFAULTS.maxRows }
): string {
  if (!columns.length) return '（无列信息）';
  if (!rows.length) return '（查询成功，返回 0 行）';

  const shown = rows.slice(0, options.maxRows);
  const header = `| ${columns.join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = shown.map((row) => `| ${columns.map((c) => cell(row[c])).join(' | ')} |`);

  const lines = [header, divider, ...body];
  if (rows.length > shown.length) {
    lines.push('', `（已截断：共 ${rows.length} 行，仅展示前 ${shown.length} 行）`);
  } else if (options.total !== undefined && options.total > rows.length) {
    lines.push('', `（共 ${options.total} 行，本次展示 ${rows.length} 行）`);
  }
  return lines.join('\n');
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}超时（${ms}ms），请缩小查询范围后重试`)), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

function requireInt(args: any, key: string): number {
  const value = Number(args?.[key]);
  if (!Number.isFinite(value)) {
    throw new ToolRejection(`缺少必填参数 ${key}（数字）。请先调用 list_connections 获取连接 ID`);
  }
  return value;
}

function optionalString(args: any, key: string): string {
  const value = args?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

async function readMaxRows(): Promise<number> {
  const raw = await internalDB.getSetting(MCP_SETTING_KEYS.maxRows);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return MCP_DEFAULTS.maxRows;
  return Math.min(Math.floor(parsed), MCP_DEFAULTS.maxRowsLimit);
}

export async function isWriteEnabled(): Promise<boolean> {
  return (await internalDB.getSetting(MCP_SETTING_KEYS.allowWrite)) === 'true';
}

/** 依据当前设置产出工具清单（写工具按开关动态注册，客户端能直观看到权限边界） */
export async function buildToolList(): Promise<McpToolDef[]> {
  const tools: McpToolDef[] = [
    {
      name: 'list_connections',
      description:
        '列出 AiSqlBoy 中已保存的数据库连接（不含密码）。返回 id、名称、类型、默认库、是否只读、授权库白名单与过期时间。调用其他工具前先执行本工具拿到 connectionId。',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'list_databases',
      description:
        '列出指定连接下可访问的数据库/Schema。若该连接是限库连接包，只会返回被授权的库。',
      inputSchema: {
        type: 'object',
        properties: {
          connectionId: { type: 'number', description: '连接 ID，来自 list_connections' },
        },
        required: ['connectionId'],
      },
    },
    {
      name: 'list_tables',
      description: '列出指定库下的所有表名。Redis 连接固定返回 Keys。',
      inputSchema: {
        type: 'object',
        properties: {
          connectionId: { type: 'number', description: '连接 ID' },
          database: { type: 'string', description: '库名/Schema；省略则用连接默认库' },
        },
        required: ['connectionId'],
      },
    },
    {
      name: 'describe_table',
      description:
        '获取单表结构：列名、类型、可空、主键、默认值、注释，以及全部索引。写 SQL 前建议先调用，避免臆造字段。',
      inputSchema: {
        type: 'object',
        properties: {
          connectionId: { type: 'number', description: '连接 ID' },
          table: { type: 'string', description: '表名' },
          database: { type: 'string', description: '库名/Schema；省略则用连接默认库' },
        },
        required: ['connectionId', 'table'],
      },
    },
    {
      name: 'run_query',
      description:
        '执行一条只读 SQL（SELECT / SHOW / EXPLAIN 等）并返回结果表格。默认自动追加行数上限，返回内容可能被截断。禁止多条语句与任何写操作。',
      inputSchema: {
        type: 'object',
        properties: {
          connectionId: { type: 'number', description: '连接 ID' },
          sql: { type: 'string', description: '单条只读 SQL，不要带结尾分号' },
          database: { type: 'string', description: '库名/Schema；省略则用连接默认库' },
          limit: { type: 'number', description: `返回行数上限，默认 ${MCP_DEFAULTS.maxRows}` },
        },
        required: ['connectionId', 'sql'],
      },
    },
    {
      name: 'explain_query',
      description:
        '查看查询执行计划，用于排查慢查询。MySQL 走 EXPLAIN，PostgreSQL 走 EXPLAIN (FORMAT TEXT)，SQLite 走 EXPLAIN QUERY PLAN；Oracle 与 Redis 不支持。',
      inputSchema: {
        type: 'object',
        properties: {
          connectionId: { type: 'number', description: '连接 ID' },
          sql: { type: 'string', description: '待分析的只读 SQL' },
          database: { type: 'string', description: '库名/Schema' },
        },
        required: ['connectionId', 'sql'],
      },
    },
    {
      name: 'redis_command',
      description:
        '在 Redis 连接上执行一条命令。未开启 MCP 写权限时仅允许只读命令（GET/SCAN/HGETALL/LRANGE/INFO 等）。',
      inputSchema: {
        type: 'object',
        properties: {
          connectionId: { type: 'number', description: '连接 ID（须为 redis 类型）' },
          command: { type: 'string', description: '完整 Redis 命令，如 GET user:1 或 HGETALL session:abc' },
          database: { type: 'string', description: 'Redis db 索引，默认 0' },
        },
        required: ['connectionId', 'command'],
      },
    },
  ];

  if (await isWriteEnabled()) {
    tools.push({
      name: 'execute_sql',
      description:
        '执行写操作 SQL（INSERT / UPDATE / DELETE / DDL）。仅在该连接非只读、且语句非危险操作（无 WHERE 的 UPDATE/DELETE）时才会真正执行。UPDATE/DELETE 会先返回预计影响行数。',
      inputSchema: {
        type: 'object',
        properties: {
          connectionId: { type: 'number', description: '连接 ID' },
          sql: { type: 'string', description: '单条写操作 SQL' },
          database: { type: 'string', description: '库名/Schema' },
        },
        required: ['connectionId', 'sql'],
      },
    });
  }

  return tools;
}

/** 只读 SQL 的通用前置校验，返回拒绝原因或 null */
function guardReadOnlySql(sql: string, config: ConnectionConfig, dbType: string): string | null {
  if (!sql.trim()) return 'sql 不能为空';
  // Redis 先分流：其命令会被 SQL 分类器判为 DANGEROUS，提示就永远走不到后面
  if (dbType === 'redis') return 'Redis 连接请使用 redis_command 工具（如 GET key、SCAN 0 COUNT 20）';
  if (hasMultipleStatements(sql)) return '禁止一次执行多条语句，请拆成多次调用';
  const allowed = config.allowedDatabases;
  if (allowed && allowed.length > 0) {
    const scopeError = checkAllowedDatabaseSql(sql, allowed);
    if (scopeError) return scopeError;
  }
  const category = classifySql(sql);
  if (category !== 'SELECT') {
    return `run_query 仅允许只读查询，当前语句被判定为 ${category}。如需写入请使用 execute_sql（需在 AiSqlBoy 设置中开启 MCP 写权限）`;
  }
  return null;
}

export async function executeTool(name: string, args: any): Promise<McpToolResult> {
  try {
    const text = await dispatch(name, args || {});
    return { content: [{ type: 'text', text }] };
  } catch (error: any) {
    const isRejection = error instanceof ToolRejection || error?.name === 'ToolRejection';

    // 非业务拒绝属于真实异常，落到主进程日志里便于排查
    if (!isRejection) {
      console.error(`[mcp] 工具 ${name} 执行异常：`, error?.stack || error);
    }

    // 驱动层有时抛出的不是 Error 实例，message 可能为空，需逐级退化取值
    const raw =
      (typeof error?.message === 'string' && error.message.trim()) ||
      (typeof error === 'string' && error.trim()) ||
      '';
    const code = error?.code ? `（${error.code}）` : '';
    const message = isRejection
      ? error.message
      : friendlyDbError(raw) + code || `未知错误（${error?.name || typeof error}）`;
    return {
      content: [{ type: 'text', text: `执行失败：${message}` }],
      isError: true,
    };
  }
}

async function dispatch(name: string, args: any): Promise<string> {
  switch (name) {
    case 'list_connections':
      return listConnections();
    case 'list_databases':
      return listDatabases(requireInt(args, 'connectionId'));
    case 'list_tables':
      return listTables(requireInt(args, 'connectionId'), optionalString(args, 'database'));
    case 'describe_table':
      return describeTable(
        requireInt(args, 'connectionId'),
        optionalString(args, 'table'),
        optionalString(args, 'database')
      );
    case 'run_query':
      return runQuery(
        requireInt(args, 'connectionId'),
        optionalString(args, 'sql'),
        optionalString(args, 'database'),
        Number(args?.limit) || undefined
      );
    case 'explain_query':
      return explainQuery(
        requireInt(args, 'connectionId'),
        optionalString(args, 'sql'),
        optionalString(args, 'database')
      );
    case 'redis_command':
      return redisCommand(
        requireInt(args, 'connectionId'),
        optionalString(args, 'command'),
        optionalString(args, 'database')
      );
    case 'execute_sql':
      return executeWriteSql(
        requireInt(args, 'connectionId'),
        optionalString(args, 'sql'),
        optionalString(args, 'database')
      );
    default:
      throw new ToolRejection(`未知工具：${name}`);
  }
}

async function listConnections(): Promise<string> {
  const list = await internalDB.getConnections();
  if (!list.length) {
    return '当前没有保存任何连接。请先在 AiSqlBoy 中新建数据库连接。';
  }
  const rows = list.map((c: ConnectionConfig) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    database: c.database || '',
    readonly: c.readOnly ? '是' : '否',
    allowed: c.allowedDatabases?.length ? c.allowedDatabases.join('、') : '不限',
    expires: c.expiresAt ? new Date(c.expiresAt).toLocaleString('zh-CN') : '永久',
  }));
  return [
    '可用连接：',
    '',
    formatTable(['id', 'name', 'type', 'database', 'readonly', 'allowed', 'expires'], rows, {
      maxRows: 100,
    }),
  ].join('\n');
}

async function listDatabases(connectionId: number): Promise<string> {
  const { config, driver } = await driverPool.acquire(connectionId);
  // 限库连接包只暴露白名单，不向外部模型泄露同实例其他库
  const databases = config.allowedDatabases?.length
    ? [...config.allowedDatabases]
    : await withTimeout(driver.getDatabases(), MCP_DEFAULTS.executionTimeout, '获取库列表');
  return `连接「${config.name}」(${config.type}) 可访问的库：\n\n${databases.map((d) => `- ${d}`).join('\n')}`;
}

async function listTables(connectionId: number, database: string): Promise<string> {
  const pooled = await driverPool.acquire(connectionId, database);
  const tables = await withTimeout(
    pooled.driver.getTables(),
    MCP_DEFAULTS.executionTimeout,
    '获取表列表'
  );
  if (!tables.length) return '该库下没有表。';
  const names = tables.map((t) => t.name).sort();
  return `共 ${names.length} 张表（库：${pooled.database || '默认'}）：\n\n${names.map((n) => `- ${n}`).join('\n')}`;
}

async function describeTable(connectionId: number, table: string, database: string): Promise<string> {
  if (!table) throw new ToolRejection('缺少必填参数 table');
  const pooled = await driverPool.acquire(connectionId, database);
  const [columns, indexes] = await withTimeout(
    Promise.all([pooled.driver.getTableColumns(table), pooled.driver.getTableIndexes(table)]),
    MCP_DEFAULTS.executionTimeout,
    '获取表结构'
  );

  // 正常表不可能没有列；查不到通常是表名拼错或不在当前库
  if (!columns.length) {
    throw new ToolRejection(
      `表「${table}」不存在，或当前账号在其所属库中看不到任何字段（库：${pooled.database || '默认'}）`
    );
  }

  const columnRows = columns.map((c) => ({
    name: c.name,
    type: c.type,
    nullable: c.nullable ? '是' : '否',
    pk: c.primaryKey ? '是' : '',
    default: c.defaultValue ?? '',
    comment: c.comment || '',
  }));

  const parts = [
    `表 \`${table}\`（库：${pooled.database || '默认'}）`,
    '',
    '列结构：',
    '',
    formatTable(['name', 'type', 'nullable', 'pk', 'default', 'comment'], columnRows, {
      maxRows: 300,
    }),
  ];

  if (indexes.length) {
    const indexRows = indexes.map((i) => ({
      name: i.name,
      columns: i.columns.join(', '),
      unique: i.unique ? '是' : '否',
      type: i.type || '',
    }));
    parts.push('', '索引：', '', formatTable(['name', 'columns', 'unique', 'type'], indexRows, { maxRows: 100 }));
  } else {
    parts.push('', '索引：（无）');
  }

  return parts.join('\n');
}

async function runQuery(
  connectionId: number,
  sql: string,
  database: string,
  limit?: number
): Promise<string> {
  const pooled = await driverPool.acquire(connectionId, database);
  const { config, driver } = pooled;

  const rejection = guardReadOnlySql(sql, config, config.type);
  if (rejection) throw new ToolRejection(rejection);

  const maxRows = await readMaxRows();
  const applied = Math.min(Math.max(Math.floor(limit || maxRows), 1), MCP_DEFAULTS.maxRowsLimit);
  const { sql: finalSql, modified } = ensureSelectLimit(sql, applied, config.type);

  const started = Date.now();
  const result = await withTimeout(
    driver.executeQuery(finalSql),
    MCP_DEFAULTS.executionTimeout,
    '查询'
  );
  const elapsed = Date.now() - started;

  const head = [
    `执行完成（${elapsed}ms${modified ? `，已自动追加行数上限 ${applied}` : ''}）`,
    modified ? `实际执行：\`${finalSql}\`` : '',
  ].filter(Boolean);

  return [...head, '', formatTable(result.columns || [], result.data || [], { maxRows: applied })].join('\n');
}

async function explainQuery(connectionId: number, sql: string, database: string): Promise<string> {
  const pooled = await driverPool.acquire(connectionId, database);
  const { config, driver } = pooled;

  const rejection = guardReadOnlySql(sql, config, config.type);
  if (rejection) throw new ToolRejection(rejection);

  const base = sql.trim().replace(/;$/, '');
  let explainSql: string;
  switch (config.type) {
    case 'mysql':
      explainSql = `EXPLAIN ${base}`;
      break;
    case 'postgresql':
      explainSql = `EXPLAIN (FORMAT TEXT) ${base}`;
      break;
    case 'sqlite':
      explainSql = `EXPLAIN QUERY PLAN ${base}`;
      break;
    default:
      throw new ToolRejection(`${config.type} 暂不支持通过 MCP 查看执行计划`);
  }

  const result = await withTimeout(
    driver.executeQuery(explainSql),
    MCP_DEFAULTS.executionTimeout,
    '执行计划分析'
  );
  return `执行计划（${config.type}）：\n\n${formatTable(result.columns || [], result.data || [], {
    maxRows: 200,
  })}`;
}

async function redisCommand(connectionId: number, command: string, database: string): Promise<string> {
  if (!command) throw new ToolRejection('缺少必填参数 command');

  // 先判连接类型再建连接：否则 '0' 会被当成库名传给 SQL 驱动，
  // 报出「PostgreSQL 不支持跨库查询」这类误导性错误，把模型带偏
  const config = await driverPool.resolveConfig(connectionId);
  if (config.type !== 'redis') {
    throw new ToolRejection(
      `redis_command 仅适用于 Redis 连接，当前连接「${config.name}」是 ${config.type}，SQL 连接请使用 run_query`
    );
  }

  const pooled = await driverPool.acquire(connectionId, database || '0');
  const { driver } = pooled;

  const allowWrite = await isWriteEnabled();
  if (!allowWrite) {
    const verb = command.trim().split(/\s+/)[0]?.toUpperCase() || '';
    if (!REDIS_READONLY_PREFIXES.includes(verb)) {
      throw new ToolRejection(
        `命令 ${verb} 属于写操作，当前 MCP 为只读模式。可在 AiSqlBoy 设置中开启「MCP 写权限」后重试`
      );
    }
  }

  const started = Date.now();
  const result = await withTimeout(
    driver.executeQuery(command),
    MCP_DEFAULTS.executionTimeout,
    'Redis 命令'
  );
  const elapsed = Date.now() - started;
  return `执行完成（${elapsed}ms）\n\n${formatTable(result.columns || [], result.data || [], {
    maxRows: 200,
  })}`;
}

async function executeWriteSql(connectionId: number, sql: string, database: string): Promise<string> {
  if (!(await isWriteEnabled())) {
    throw new ToolRejection('MCP 写权限未开启。请在 AiSqlBoy 设置中打开「MCP 写权限」后重试');
  }
  if (!sql.trim()) throw new ToolRejection('sql 不能为空');

  const pooled = await driverPool.acquire(connectionId, database);
  const { config, driver } = pooled;

  if (config.readOnly) {
    throw new ToolRejection(`连接「${config.name}」为只读模式，禁止任何写操作`);
  }
  if (hasMultipleStatements(sql)) {
    throw new ToolRejection('禁止一次执行多条语句，请拆成多次调用');
  }
  const allowed = config.allowedDatabases;
  if (allowed && allowed.length > 0) {
    const scopeError = checkAllowedDatabaseSql(sql, allowed);
    if (scopeError) throw new ToolRejection(scopeError);
  }

  const category = classifySql(sql);
  if (category === 'DANGEROUS') {
    throw new ToolRejection(
      '该语句被判定为危险操作（如无 WHERE 的 UPDATE/DELETE，或无法识别的语句），已拒绝执行。请补充 WHERE 条件后重试'
    );
  }
  if (category === 'SELECT') {
    throw new ToolRejection('这是只读语句，请改用 run_query');
  }

  // UPDATE/DELETE 先预跑影响面，把结果作为执行前的可核对信息返回
  let impactNote = '';
  if (category === 'UPDATE' || category === 'DELETE') {
    const previewSql = buildImpactPreviewSql(sql);
    if (previewSql) {
      try {
        const preview = await withTimeout(
          driver.executeQuery(previewSql),
          MCP_DEFAULTS.executionTimeout,
          '影响面预览'
        );
        const count = preview.data?.[0]?.impact_count ?? preview.data?.[0]?.IMPACT_COUNT;
        if (count !== undefined) impactNote = `预计影响 ${count} 行。`;
      } catch {
        impactNote = '未能预估影响行数。';
      }
    }
  }

  const started = Date.now();
  const result = await withTimeout(
    driver.executeQuery(sql),
    MCP_DEFAULTS.executionTimeout,
    '写操作'
  );
  const elapsed = Date.now() - started;

  const affected = result.affectedRows;
  const head = [
    `执行成功（${elapsed}ms，${category}）`,
    impactNote,
    affected !== undefined ? `影响行数：${affected}` : '',
  ].filter(Boolean);

  if (result.data?.length) {
    return [...head, '', formatTable(result.columns || [], result.data, { maxRows: 200 })].join('\n');
  }
  return head.join('\n');
}
