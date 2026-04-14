/** Raw FK edge: child table column → parent table column */

export type RawFkEdge = {
  childTable: string;
  childCol: string;
  parentTable: string;
  parentCol: string;
};

function escapeSqliteIdent(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function dedupeEdges(edges: RawFkEdge[]): RawFkEdge[] {
  const seen = new Set<string>();
  const out: RawFkEdge[] = [];
  for (const e of edges) {
    const k = `${e.childTable}\0${e.parentTable}\0${e.childCol}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

/** Prefer metadata FKs; fill missing pairs from heuristic without duplicating. */
export function mergeFkSources(metadata: RawFkEdge[], heuristic: RawFkEdge[]): RawFkEdge[] {
  const pair = new Set<string>();
  const out: RawFkEdge[] = [];
  for (const e of metadata) {
    const k = `${e.childTable}\0${e.parentTable}`;
    pair.add(k);
    out.push(e);
  }
  for (const e of heuristic) {
    const k = `${e.childTable}\0${e.parentTable}`;
    if (pair.has(k)) continue;
    pair.add(k);
    out.push(e);
  }
  return dedupeEdges(out);
}

export function inferHeuristicFkEdges(
  tables: string[],
  columnsByTable: Record<string, string[]>
): RawFkEdge[] {
  const canonical = new Map<string, string>();
  for (const t of tables) {
    canonical.set(t.toLowerCase(), t);
  }
  const edges: RawFkEdge[] = [];
  const seen = new Set<string>();

  const resolveTable = (name: string): string | undefined => canonical.get(name.toLowerCase());

  for (const t of tables) {
    const cols = columnsByTable[t] || [];
    for (const col of cols) {
      const m = /^(.+)_id$/i.exec(col.trim());
      if (!m) continue;
      const base = m[1].toLowerCase();
      const candidates = [base + 's', base + 'es', base];
      if (base === 'user') candidates.unshift('users');
      for (const cand of candidates) {
        const parent = resolveTable(cand);
        if (parent && parent !== t) {
          const key = `${t}|${parent}|${col}`;
          if (seen.has(key)) break;
          seen.add(key);
          edges.push({
            childTable: t,
            childCol: col,
            parentTable: parent,
            parentCol: 'id'
          });
          break;
        }
      }
    }
  }
  return edges;
}

type ExecuteQuery = (sql: string) => Promise<{ data: any[]; columns: string[] }>;

export async function fetchForeignKeysFromDb(
  driverType: 'sqlite' | 'mysql' | 'postgresql' | 'oracle' | 'redis',
  tableNames: string[],
  executeQuery: ExecuteQuery
): Promise<RawFkEdge[]> {
  if (driverType === 'redis' || tableNames.length === 0) return [];

  if (driverType === 'sqlite') {
    const edges: RawFkEdge[] = [];
    for (const name of tableNames) {
      const sql = `PRAGMA foreign_key_list(${escapeSqliteIdent(name)})`;
      const { data } = await executeQuery(sql);
      for (const row of data) {
        const parentTable = row.table != null ? String(row.table) : '';
        const childCol = row.from != null ? String(row.from) : '';
        const parentCol = row.to != null ? String(row.to) : '';
        if (!parentTable) continue;
        edges.push({
          childTable: name,
          childCol,
          parentTable,
          parentCol: parentCol || 'id'
        });
      }
    }
    return dedupeEdges(edges);
  }

  if (driverType === 'mysql') {
    const { data } = await executeQuery(`
      SELECT
        TABLE_NAME AS child_table,
        COLUMN_NAME AS child_col,
        REFERENCED_TABLE_NAME AS parent_table,
        REFERENCED_COLUMN_NAME AS parent_col
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    const edges: RawFkEdge[] = [];
    for (const row of data) {
      edges.push({
        childTable: String(row.child_table),
        childCol: String(row.child_col),
        parentTable: String(row.parent_table),
        parentCol: String(row.parent_col || 'id')
      });
    }
    return dedupeEdges(edges);
  }

  if (driverType === 'postgresql') {
    const { data } = await executeQuery(`
      SELECT
        tbl.relname AS child_table,
        a.attname AS child_col,
        ft.relname AS parent_table,
        af.attname AS parent_col
      FROM pg_constraint c
      JOIN pg_class tbl ON tbl.oid = c.conrelid AND tbl.relkind = 'r'
      JOIN pg_class ft ON ft.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ANY (c.confkey)
      WHERE c.contype = 'f'
    `);
    const edges: RawFkEdge[] = [];
    for (const row of data) {
      edges.push({
        childTable: String(row.child_table),
        childCol: String(row.child_col),
        parentTable: String(row.parent_table),
        parentCol: String(row.parent_col || 'id')
      });
    }
    return dedupeEdges(edges);
  }

  if (driverType === 'oracle') {
    const { data } = await executeQuery(`
      SELECT
        a.table_name AS child_table,
        a.column_name AS child_col,
        c_pk.table_name AS parent_table,
        b.column_name AS parent_col
      FROM all_cons_columns a
      JOIN all_constraints c
        ON a.owner = c.owner AND a.constraint_name = c.constraint_name
      JOIN all_constraints c_pk
        ON c.r_owner = c_pk.owner AND c.r_constraint_name = c_pk.constraint_name
      JOIN all_cons_columns b
        ON c_pk.owner = b.owner
        AND c_pk.constraint_name = b.constraint_name
        AND a.position = b.position
      WHERE c.constraint_type = 'R'
        AND a.owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
    `);
    const edges: RawFkEdge[] = [];
    const tset = new Set(tableNames.map((t) => t.toUpperCase()));
    for (const row of data) {
      const child = String(row.child_table ?? row.CHILD_TABLE ?? '');
      if (!tset.has(child.toUpperCase())) continue;
      edges.push({
        childTable: child,
        childCol: String(row.child_col ?? row.CHILD_COL ?? ''),
        parentTable: String(row.parent_table ?? row.PARENT_TABLE ?? ''),
        parentCol: String(row.parent_col ?? row.PARENT_COL ?? 'id'),
      });
    }
    return dedupeEdges(edges);
  }

  return [];
}
