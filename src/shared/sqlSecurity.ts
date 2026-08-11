/**
 * SQL 安全分析模块
 * 负责 SQL 语句的分类、危险检测、安全加固
 */

import type { SqlCategory } from './agentTypes';

/**
 * 对 SQL 语句进行安全分类
 * 分类规则按优先级从高到低：
 * 1. DDL（CREATE/ALTER/DROP/TRUNCATE/RENAME）
 * 2. 无 WHERE 的 DELETE/UPDATE → DANGEROUS
 * 3. DELETE/UPDATE/INSERT
 * 4. SELECT 及只读元数据命令（SHOW/DESC/DESCRIBE/EXPLAIN）
 * 5. 其他未知 → DANGEROUS
 */
export function classifySql(sql: string): SqlCategory {
  const trimmed = stripSqlNoise(sql).toUpperCase();

  // DDL 操作
  if (/^(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/.test(trimmed)) return 'DDL';

  // 危险操作：无 WHERE 的 DELETE
  if (/^DELETE\b/.test(trimmed)) {
    if (!/\bWHERE\b/.test(trimmed)) return 'DANGEROUS';
    return 'DELETE';
  }

  // 危险操作：无 WHERE 的 UPDATE
  if (/^UPDATE\b/.test(trimmed)) {
    if (!/\bWHERE\b/.test(trimmed)) return 'DANGEROUS';
    return 'UPDATE';
  }

  if (/^INSERT\b/.test(trimmed)) return 'INSERT';

  // 只读元数据命令（MySQL 等），视为安全查询
  if (/^(SHOW|DESC|DESCRIBE|EXPLAIN)\b/.test(trimmed)) return 'SELECT';

  // SELECT（包括 WITH ... AS ... SELECT）
  if (/^SELECT\b/.test(trimmed) || /^WITH\b[\s\S]*\bSELECT\b/.test(trimmed)) return 'SELECT';

  // 未知类型，按危险处理
  return 'DANGEROUS';
}

/**
 * 剔除 SQL 中的字符串字面量、标识符引用和注释，
 * 避免字面量中的关键字（如 WHERE、分号）干扰安全检测。
 * 被剔除的部分替换为占位符，保留语句结构。
 */
export function stripSqlNoise(sql: string): string {
  return sql.replace(
    /('(?:[^'\\]|\\.|'')*')|("(?:[^"\\]|\\.|"")*")|(`[^`]*`)|(\/\*[\s\S]*?\*\/)|(--[^\n]*)/g,
    ' '
  );
}

const SQL_NOISE_RE = /('(?:[^'\\]|\\.|'')*')|("(?:[^"\\]|\\.|"")*")|(`[^`]*`)|(\/\*[\s\S]*?\*\/)|(--[^\n]*)/g;

/**
 * 将字符串字面量/注释替换为等长空格，保持字符偏移不变，
 * 便于在掩码串上定位关键字后映射回原始 SQL。
 */
function maskSqlNoise(sql: string): string {
  return sql.replace(SQL_NOISE_RE, (m) => ' '.repeat(m.length));
}

/** 计算掩码串中某位置的括号深度 */
function parenDepth(masked: string, idx: number): number {
  let d = 0;
  for (let i = 0; i < idx; i++) {
    if (masked[i] === '(') d++;
    else if (masked[i] === ')') d--;
  }
  return d;
}

/** 从指定位置开始查找括号深度为 0 的关键字，找不到返回 -1 */
function findTopLevelKeyword(masked: string, keyword: string, from: number): number {
  const re = new RegExp(`\\b${keyword}\\b`, 'gi');
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    if (parenDepth(masked, m.index) === 0) return m.index;
  }
  return -1;
}

/**
 * 为 UPDATE/DELETE 语句构建影响面预览 SQL（SELECT COUNT(*)）。
 * 无法安全解析时返回 null。仅处理带 WHERE 的语句；
 * 无 WHERE 的危险操作不做预览（避免全表扫描）。
 */
export function buildImpactPreviewSql(sql: string): string | null {
  const original = sql.trim();
  const masked = maskSqlNoise(original);
  const upper = masked.toUpperCase();

  let target: string | null = null;
  let searchFrom = 0;

  const delMatch = upper.match(/^DELETE\s+FROM\s+/i);
  const updMatch = upper.match(/^UPDATE\s+/i);

  if (delMatch) {
    searchFrom = delMatch[0].length;
    const whereIdx = findTopLevelKeyword(masked, 'WHERE', searchFrom);
    if (whereIdx < 0) return null;
    target = original.slice(searchFrom, whereIdx).trim();
    return finishCountSql(target, masked, original, whereIdx);
  }

  if (updMatch) {
    const tblStart = updMatch[0].length;
    const setIdx = findTopLevelKeyword(masked, 'SET', tblStart);
    if (setIdx < 0) return null;
    const whereIdx = findTopLevelKeyword(masked, 'WHERE', setIdx);
    if (whereIdx < 0) return null;
    target = original.slice(tblStart, setIdx).trim();
    return finishCountSql(target, masked, original, whereIdx);
  }

  return null;
}

/** 拼接 COUNT 查询：取 WHERE 子句，裁掉末尾的 ORDER BY / LIMIT / FETCH */
function finishCountSql(target: string, masked: string, original: string, whereIdx: number): string | null {
  if (!target) return null;
  const clauseStart = whereIdx + 'WHERE'.length;
  let cut = original.length;
  const tailRe = /\b(ORDER\s+BY|LIMIT|FETCH)\b/gi;
  tailRe.lastIndex = clauseStart;
  let m: RegExpExecArray | null;
  while ((m = tailRe.exec(masked)) !== null) {
    if (parenDepth(masked, m.index) === 0) {
      cut = m.index;
      break;
    }
  }
  const where = original.slice(clauseStart, cut).trim().replace(/;\s*$/, '').trim();
  if (!where) return null;
  return `SELECT COUNT(*) AS impact_count FROM ${target} WHERE ${where}`;
}

/**
 * 检测 SQL 中是否包含多条语句（分号分隔）
 * Agent 模式下默认禁止多语句执行
 */
export function hasMultipleStatements(sql: string): boolean {
  // 剔除字符串字面量、标识符引用和注释中的分号，避免误判
  const cleaned = stripSqlNoise(sql);
  // 移除末尾的分号
  const trimmed = cleaned.trim().replace(/;$/, '');
  return trimmed.includes(';');
}

/**
 * 为没有行数限制的 SELECT 语句自动追加限制子句，按数据库方言生成：
 * - Oracle: FETCH FIRST n ROWS ONLY
 * - 其他（MySQL / PostgreSQL / SQLite）: LIMIT n
 * @returns 修改后的 SQL 和是否进行了修改
 */
export function ensureSelectLimit(sql: string, limit: number, dbType?: string): { sql: string; modified: boolean } {
  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();

  // 非 SELECT/WITH 不处理（SHOW 等只读命令不支持行数限制子句，同样跳过）
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    return { sql, modified: false };
  }

  // 已经有行数限制
  if (/\bLIMIT\b\s+\d+/i.test(trimmed) || /\bFETCH\s+FIRST\b/i.test(trimmed)) {
    return { sql, modified: false };
  }

  const withoutSemicolon = trimmed.replace(/;$/, '');

  // Oracle 不支持 LIMIT，使用 FETCH FIRST 语法
  if (dbType === 'oracle') {
    return { sql: `${withoutSemicolon} FETCH FIRST ${limit} ROWS ONLY`, modified: true };
  }

  return {
    sql: `${withoutSemicolon} LIMIT ${limit}`,
    modified: true,
  };
}

/**
 * 根据 SQL 类别和权限级别判断是否需要用户审批
 */
export function requiresApproval(
  category: SqlCategory,
  permissionLevel: 'readonly' | 'write-confirm' | 'full-control'
): boolean {
  // SELECT 始终自动执行
  if (category === 'SELECT') return false;

  // DANGEROUS 始终需要审批（即使在 full-control 下）
  if (category === 'DANGEROUS') return true;

  // readonly 模式下，非 SELECT 一律不允许（返回 true 但实际会被拒绝）
  if (permissionLevel === 'readonly') return false; // 直接拒绝，不需要审批

  // write-confirm 和 full-control 模式下，写操作需要审批
  return true;
}

/**
 * 根据 SQL 类别和权限级别判断是否允许执行
 */
export function isAllowed(
  category: SqlCategory,
  permissionLevel: 'readonly' | 'write-confirm' | 'full-control'
): boolean {
  // SELECT 始终允许
  if (category === 'SELECT') return true;

  // readonly 模式只允许 SELECT
  if (permissionLevel === 'readonly') return false;

  // write-confirm 模式不允许 DDL 和 DANGEROUS
  if (permissionLevel === 'write-confirm') {
    return category !== 'DDL' && category !== 'DANGEROUS';
  }

  // full-control 模式不允许 DANGEROUS
  if (permissionLevel === 'full-control') {
    return category !== 'DANGEROUS';
  }

  return false;
}

/**
 * 获取 SQL 类别的中文描述和风险等级
 */
export function getSqlCategoryInfo(category: SqlCategory): {
  label: string;
  riskLevel: 'safe' | 'medium' | 'high' | 'dangerous';
  color: string;
} {
  const map: Record<SqlCategory, { label: string; riskLevel: 'safe' | 'medium' | 'high' | 'dangerous'; color: string }> = {
    SELECT: { label: '查询 (只读)', riskLevel: 'safe', color: 'text-emerald-600' },
    INSERT: { label: '插入数据', riskLevel: 'medium', color: 'text-blue-600' },
    UPDATE: { label: '更新数据', riskLevel: 'medium', color: 'text-amber-600' },
    DELETE: { label: '删除数据', riskLevel: 'high', color: 'text-orange-600' },
    DDL: { label: '结构变更 (DDL)', riskLevel: 'high', color: 'text-red-600' },
    DANGEROUS: { label: '危险操作', riskLevel: 'dangerous', color: 'text-red-700' },
  };
  return map[category];
}
