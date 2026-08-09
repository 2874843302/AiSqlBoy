/**
 * SQL 安全分析模块
 * 负责 SQL 语句的分类、危险检测、安全加固
 */

import type { SqlCategory } from '../../shared/agentTypes';

/**
 * 对 SQL 语句进行安全分类
 * 分类规则按优先级从高到低：
 * 1. DDL（CREATE/ALTER/DROP/TRUNCATE/RENAME）
 * 2. 无 WHERE 的 DELETE/UPDATE → DANGEROUS
 * 3. DELETE/UPDATE/INSERT
 * 4. SELECT
 * 5. 其他未知 → DANGEROUS
 */
export function classifySql(sql: string): SqlCategory {
  const trimmed = sql.trim().toUpperCase().replace(/\/\*[\s\S]*?\*\//g, '');

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

  // SELECT（包括 WITH ... AS ... SELECT）
  if (/^SELECT\b/.test(trimmed) || /^WITH\b[\s\S]*\bSELECT\b/.test(trimmed)) return 'SELECT';

  // 未知类型，按危险处理
  return 'DANGEROUS';
}

/**
 * 检测 SQL 中是否包含多条语句（分号分隔）
 * Agent 模式下默认禁止多语句执行
 */
export function hasMultipleStatements(sql: string): boolean {
  // 移除字符串字面量中的分号，避免误判
  const cleaned = sql.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');
  // 移除末尾的分号
  const trimmed = cleaned.trim().replace(/;$/, '');
  return trimmed.includes(';');
}

/**
 * 为没有 LIMIT 的 SELECT 语句自动追加 LIMIT
 * @returns 修改后的 SQL 和是否进行了修改
 */
export function ensureSelectLimit(sql: string, limit: number): { sql: string; modified: boolean } {
  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();

  // 非 SELECT 不处理
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    return { sql, modified: false };
  }

  // 已经有 LIMIT
  if (/\bLIMIT\b\s+\d+/i.test(trimmed)) {
    return { sql, modified: false };
  }

  // 移除末尾分号后追加 LIMIT
  const withoutSemicolon = trimmed.replace(/;$/, '');
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
