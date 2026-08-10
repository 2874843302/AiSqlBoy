import Prism from 'prismjs';
import 'prismjs/components/prism-sql';

/** 按数据库类型对表名加引号（用于查询语句） */
export const quoteTableNameForQuery = (tableName: string, dbType?: string) => {
  if (dbType === 'mysql') {
    return `\`${tableName.replace(/`/g, '``')}\``;
  }
  if (dbType === 'postgresql') {
    return `"${tableName.replace(/"/g, '""')}"`;
  }
  return tableName;
};

/** 按数据库类型对标识符加引号 */
export const quoteIdentifier = (name: string, dbType?: string) => {
  if (dbType === 'mysql') {
    return `\`${name.replace(/`/g, '``')}\``;
  }
  if (dbType === 'postgresql' || dbType === 'sqlite') {
    return `"${name.replace(/"/g, '""')}"`;
  }
  // Oracle / fallback
  return name;
};

export const buildFallbackCreateTableSql = (tableName: string, cols: any[], idxs: any[]) => {
  const colLines = cols.map((c: any) => {
    const parts = [`${c.name} ${c.type}`];
    if (!c.nullable) parts.push('NOT NULL');
    if (c.defaultValue !== null && c.defaultValue !== undefined && String(c.defaultValue) !== '') {
      parts.push(`DEFAULT ${c.defaultValue}`);
    }
    if (c.autoIncrement) parts.push('AUTO_INCREMENT');
    if (c.primaryKey) parts.push('PRIMARY KEY');
    if (c.comment) parts.push(`COMMENT '${String(c.comment).replace(/'/g, "''")}'`);
    return `  ${parts.join(' ')}`;
  });
  const idxLines = (idxs || []).map((idx: any) => {
    const unique = idx.unique ? 'UNIQUE ' : '';
    return `  ${unique}INDEX ${idx.name} (${(idx.columns || []).join(', ')})`;
  });
  return `CREATE TABLE ${tableName} (\n${[...colLines, ...idxLines].join(',\n')}\n);`;
};

export const stripSqlComments = (sql: string) => {
  if (!sql) return '';

  // 1. 移除多行注释 /* ... */
  // 使用非贪婪匹配，确保不会误删两条多行注释之间的正常 SQL
  let cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, '');

  // 2. 移除单行注释 -- 或 # 或 //
  // 改进：按行处理，但保留行尾的换行符，避免多条 SQL 被挤到同一行导致语法错误
  cleaned = cleaned.split('\n').map(line => {
    // 匹配 -- 或 # 或 // 开头的注释
    // 注意：这里仍然是简单处理，但在处理 DDL/DML 时通常足够
    const dashIndex = line.indexOf('--');
    const hashIndex = line.indexOf('#');
    const doubleSlashIndex = line.indexOf('//');

    const indices = [dashIndex, hashIndex, doubleSlashIndex].filter(i => i !== -1);
    let commentIndex = indices.length > 0 ? Math.min(...indices) : -1;

    if (commentIndex !== -1) {
      return line.substring(0, commentIndex);
    }
    return line;
  }).join('\n');

  // 3. 规范化空格，但不移除所有换行，确保多语句 SQL 依然清晰
  return cleaned.trim();
};

export const highlightSqlForDisplay = (sql: string) => {
  try {
    return Prism.highlight(sql, Prism.languages.sql, 'sql');
  } catch {
    return sql
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
};
