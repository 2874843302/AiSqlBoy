import { useState } from 'react';
import { ConnectionConfig } from '../../shared/types';
import { ERAttribute, ERLabelLanguage } from '../components/er/ERDiagramModal';
import {
  ERSchemaRelationship,
  ERSchemaTable
} from '../components/er/ERSchemaDiagramModal';
import { fetchForeignKeysFromDb, inferHeuristicFkEdges, mergeFkSources } from '../utils/schemaErForeignKeys';

interface UseErDiagramOptions {
  activeConnection: ConnectionConfig | null;
  selectedDatabase: string | null;
  setSelectedDatabase: (db: string) => void;
  setToast: (toast: { message: string; type: 'error' | 'success' | 'info' }) => void;
}

const SCHEMA_ER_MAX_TABLES = 80;

export const useErDiagram = ({ activeConnection, selectedDatabase, setSelectedDatabase, setToast }: UseErDiagramOptions) => {
  const [erDiagram, setERDiagram] = useState<{
    show: boolean;
    loading: boolean;
    tableName: string;
    attributes: ERAttribute[];
    sourceSql: string;
    labelLanguage: ERLabelLanguage;
    entityDisplayName?: string;
  }>({ show: false, loading: false, tableName: '', attributes: [], sourceSql: '', labelLanguage: 'zh' });
  const [erSchemaDiagram, setErSchemaDiagram] = useState<{
    show: boolean;
    loading: boolean;
    databaseName: string;
    tables: ERSchemaTable[];
    relationships: ERSchemaRelationship[];
    summary: string;
    labelLanguage: ERLabelLanguage;
  }>({
    show: false,
    loading: false,
    databaseName: '',
    tables: [],
    relationships: [],
    summary: '',
    labelLanguage: 'zh'
  });
  const [erLanguagePickTable, setErLanguagePickTable] = useState<string | null>(null);
  const [erSchemaLanguagePickDb, setErSchemaLanguagePickDb] = useState<string | null>(null);

  const handleGenerateERDiagram = async (tableName: string, labelLanguage: ERLabelLanguage) => {
    setERDiagram({
      show: true,
      loading: true,
      tableName,
      attributes: [],
      sourceSql: '',
      labelLanguage,
      entityDisplayName: undefined
    });
    try {
      const cols = await window.electronAPI.getTableColumns(tableName);
      const colDefs = cols.map((c: any) => {
        const parts = [`${c.name} ${c.type}`];
        if (c.primaryKey) parts.push('PRIMARY KEY');
        if (c.nullable === false) parts.push('NOT NULL');
        if (c.defaultValue !== undefined && c.defaultValue !== null && `${c.defaultValue}` !== '') {
          parts.push(`DEFAULT ${c.defaultValue}`);
        }
        return `  ${parts.join(' ')}`;
      });
      const tableSql = `CREATE TABLE ${tableName} (\n${colDefs.join(',\n')}\n);`;

      const langInstruction =
        labelLanguage === 'zh'
          ? `展示语言为中文：JSON 中 entity 为简短中文表意名称；attributes 数组顺序必须与 CREATE TABLE 中列顺序完全一致；每项 name 为该列在 ER 图上的展示名（简短中文）。硬性规则：若某列在 SQL 中的原始列名为 id（不区分大小写），则该项 name 必须为英文小写 id，禁止译为「标识」等中文。`
          : `Display language English: entity and attribute display names in concise English. attributes array order must exactly match column order in CREATE TABLE. Hard rule: if a column's original SQL name is id (case-insensitive), name must be exactly "id".`;

      const prompt = `${langInstruction}\n请把下面 SQL 表结构解析为 ER 信息，仅返回 JSON，不要任何解释。\n\nSQL:\n${tableSql}\n\nJSON 格式:\n{"entity":"表展示名","attributes":[{"name":"字段展示名","type":"字段类型","key":"PK|FK|UK|NONE"}]}`;
      const aiRes = await window.electronAPI.aiChat([
        { role: 'system', content: '你是数据库建模助手。必须只返回合法 JSON。' },
        { role: 'user', content: prompt }
      ]);

      let attrs: ERAttribute[] = cols.map((c: any) => ({
        name: c.name,
        type: c.type,
        key: c.primaryKey ? 'PK' : 'NONE'
      }));

      let entityDisplayName: string | undefined;

      if (aiRes.success && aiRes.response) {
        const raw = aiRes.response.trim();
        const jsonBlock = raw.match(/```json\s*([\s\S]*?)```/i)?.[1] || raw.match(/\{[\s\S]*\}/)?.[0];
        if (jsonBlock) {
          try {
            const parsed = JSON.parse(jsonBlock);
            if (parsed?.entity != null && String(parsed.entity).trim() !== '') {
              entityDisplayName = String(parsed.entity).trim();
            }
            if (Array.isArray(parsed?.attributes) && parsed.attributes.length > 0) {
              attrs = parsed.attributes
                .filter((a: any) => a && a.name)
                .map((a: any, idx: number) => {
                  const col = cols[idx];
                  const sqlName = col?.name != null ? String(col.name) : '';
                  const isIdCol = sqlName.toLowerCase() === 'id';
                  return {
                    name: isIdCol ? 'id' : String(a.name),
                    type: a.type ? String(a.type) : undefined,
                    key: a.key ? String(a.key).toUpperCase() : 'NONE'
                  };
                });
            }
          } catch {
            /* keep attrs from columns */
          }
        }
      } else {
        attrs = cols.map((c: any) => ({
          name: String(c.name).toLowerCase() === 'id' ? 'id' : c.name,
          type: c.type,
          key: c.primaryKey ? 'PK' : 'NONE'
        }));
      }

      attrs = attrs.map((a, idx) => {
        const sqlName = cols[idx]?.name != null ? String(cols[idx].name) : '';
        if (sqlName.toLowerCase() === 'id') return { ...a, name: 'id' };
        return a;
      });

      setERDiagram({
        show: true,
        loading: false,
        tableName,
        attributes: attrs,
        sourceSql: tableSql,
        labelLanguage,
        entityDisplayName
      });
    } catch (err: any) {
      setERDiagram((prev) => ({ ...prev, loading: false }));
      setToast({ message: `生成 ER 图失败: ${err.message}`, type: 'error' });
    }
  };

  const handleGenerateSchemaERDiagram = async (dbName: string, labelLanguage: ERLabelLanguage) => {
    if (!activeConnection || activeConnection.type === 'redis') return;

    setErSchemaDiagram({
      show: true,
      loading: true,
      databaseName: dbName,
      tables: [],
      relationships: [],
      summary: '',
      labelLanguage
    });

    try {
      if (selectedDatabase !== dbName) {
        const result = await window.electronAPI.useDatabase(dbName);
        if (!result.success) throw new Error(result.error || '切换数据库失败');
        setSelectedDatabase(dbName);
      }

      const tableList = await window.electronAPI.getTables();
      const slice = tableList.slice(0, SCHEMA_ER_MAX_TABLES);
      if (tableList.length > SCHEMA_ER_MAX_TABLES) {
        setToast({
          message: `表数量超过 ${SCHEMA_ER_MAX_TABLES}，仅展示前 ${SCHEMA_ER_MAX_TABLES} 张`,
          type: 'info'
        });
      }

      if (slice.length === 0) {
        setErSchemaDiagram({
          show: true,
          loading: false,
          databaseName: dbName,
          tables: [],
          relationships: [],
          summary: '当前库中暂无数据表',
          labelLanguage
        });
        return;
      }

      const columnsAll = await Promise.all(slice.map((t) => window.electronAPI.getTableColumns(t.name)));
      const colsByTable: Record<string, string[]> = {};
      slice.forEach((t, i) => {
        colsByTable[t.name] = columnsAll[i].map((c: { name: string }) => String(c.name));
      });

      const nameSet = new Set(slice.map((t) => t.name));
      const meta = await fetchForeignKeysFromDb(
        activeConnection.type,
        slice.map((t) => t.name),
        (sql) => window.electronAPI.executeQuery(sql)
      );
      const heuristic = inferHeuristicFkEdges(
        slice.map((t) => t.name),
        colsByTable
      );
      const merged = mergeFkSources(meta, heuristic).filter(
        (e) =>
          nameSet.has(e.childTable) &&
          nameSet.has(e.parentTable) &&
          e.childTable !== e.parentTable
      );

      const pairMap = new Map<string, (typeof merged)[number]>();
      for (const e of merged) {
        const k = `${e.childTable}\0${e.parentTable}`;
        if (!pairMap.has(k)) pairMap.set(k, e);
      }
      let relationEdges = [...pairMap.values()];
      let relationSource: 'fk' | 'ai-infer' = 'fk';

      if (relationEdges.length === 0) {
        const inferPrompt =
          labelLanguage === 'zh'
            ? `根据下面数据库结构，推断最可能的表关系（子表->父表）。只返回 JSON：{"rels":[{"from":"子表","to":"父表"}]}。\n规则：1) 仅使用已给表名；2) 不要自关联；3) 优先 *_id、*Id、外键命名约定。`
            : `Infer likely table relationships (child->parent) from the schema below. JSON only: {"rels":[{"from":"child","to":"parent"}]}. Rules: use existing tables only, no self-links, prioritize *_id/*Id naming conventions.`;
        const inferInput = JSON.stringify(
          slice.map((t) => ({ table: t.name, columns: colsByTable[t.name] || [] }))
        );
        const inferRes = await window.electronAPI.aiChat([
          { role: 'system', content: '你是数据库建模助手。必须只返回合法 JSON。' },
          { role: 'user', content: `${inferPrompt}\n\n${inferInput}` }
        ]);
        if (inferRes.success && inferRes.response) {
          const raw = inferRes.response.trim();
          const jsonBlock = raw.match(/```json\s*([\s\S]*?)```/i)?.[1] || raw.match(/\{[\s\S]*\}/)?.[0];
          if (jsonBlock) {
            try {
              const parsed = JSON.parse(jsonBlock);
              if (Array.isArray(parsed?.rels)) {
                const uniq = new Map<string, { childTable: string; parentTable: string }>();
                for (const r of parsed.rels) {
                  const from = r?.from != null ? String(r.from) : '';
                  const to = r?.to != null ? String(r.to) : '';
                  if (!nameSet.has(from) || !nameSet.has(to) || from === to) continue;
                  const k = `${from}\0${to}`;
                  if (!uniq.has(k)) uniq.set(k, { childTable: from, parentTable: to });
                }
                relationEdges = [...uniq.values()].map((e) => ({
                  childTable: e.childTable,
                  parentTable: e.parentTable,
                  childCol: '',
                  parentCol: 'id'
                }));
                if (relationEdges.length > 0) relationSource = 'ai-infer';
              }
            } catch {
              /* ignore ai infer parse failure */
            }
          }
        }
      }

      const normalizeCard = (raw?: string, fallback: '1' | 'N' | 'M' = 'N') => {
        const s = (raw || '').trim();
        if (!s) return fallback;
        const up = s.toUpperCase();
        if (up === '1' || s === '一') return '1';
        if (up === 'N' || up === 'M' || s === '多') return up === 'M' ? 'M' : 'N';
        if (/^[1NM]$/i.test(s)) return s.toUpperCase() as '1' | 'N' | 'M';
        return fallback;
      };

      const defaultRel = labelLanguage === 'zh' ? '关联' : 'rel';
      let rels: ERSchemaRelationship[] = relationEdges.map((e, i) => ({
        id: `rel-${i}`,
        from: e.childTable,
        to: e.parentTable,
        label: defaultRel,
        fromCard: 'N',
        toCard: '1'
      }));

      if (relationEdges.length > 0) {
        const payload = {
          tables: slice.map((t) => ({ name: t.name, columns: colsByTable[t.name] || [] })),
          rels: relationEdges.map((e) => ({ from: e.childTable, to: e.parentTable }))
        };
        const langInstruction =
          labelLanguage === 'zh'
            ? `请为每条「子表(from) -> 父表(to)」关系推断：\n- label: 菱形中的关系名（2-6字）\n- fromCard/toCard: 连线两端基数，必须使用 1/N/M（禁止输出“一/多”）\n只返回 JSON，不要解释。\n`
            : `For each relationship child(from) -> parent(to), infer:\n- label: short relationship name (1-3 words)\n- fromCard/toCard: cardinality labels near child/parent ends (e.g. 1/N, 0..1/N)\nJSON only.\n`;
        const prompt = `${langInstruction}JSON 格式: {\"rels\":[{\"from\":\"...\",\"to\":\"...\",\"label\":\"...\",\"fromCard\":\"...\",\"toCard\":\"...\"}]}\n\n${JSON.stringify(
          payload
        )}`;
        const aiRes = await window.electronAPI.aiChat([
          { role: 'system', content: '你是数据库建模助手。必须只返回合法 JSON。' },
          { role: 'user', content: prompt }
        ]);
        if (aiRes.success && aiRes.response) {
          const raw = aiRes.response.trim();
          const jsonBlock = raw.match(/```json\s*([\s\S]*?)```/i)?.[1] || raw.match(/\{[\s\S]*\}/)?.[0];
          if (jsonBlock) {
            try {
              const parsed = JSON.parse(jsonBlock);
              if (Array.isArray(parsed?.rels)) {
                const map = new Map<
                  string,
                  { label?: string; fromCard?: string; toCard?: string }
                >();
                for (const r of parsed.rels) {
                  if (r?.from != null && r?.to != null) {
                    map.set(`${String(r.from)}\0${String(r.to)}`, {
                      label: r.label != null ? String(r.label).trim() : undefined,
                      fromCard: r.fromCard != null ? String(r.fromCard).trim() : undefined,
                      toCard: r.toCard != null ? String(r.toCard).trim() : undefined
                    });
                  }
                }
                rels = rels.map((r) => ({
                  ...r,
                  label: map.get(`${r.from}\0${r.to}`)?.label || r.label,
                  fromCard: normalizeCard(map.get(`${r.from}\0${r.to}`)?.fromCard, 'N'),
                  toCard: normalizeCard(map.get(`${r.from}\0${r.to}`)?.toCard, '1')
                }));
              }
            } catch {
              /* keep defaults */
            }
          }
        }
      }

      rels = rels.map((r) => ({
        ...r,
        fromCard: normalizeCard(r.fromCard, 'N'),
        toCard: normalizeCard(r.toCard, '1')
      }));

      const SCHEMA_ER_ATTR_CAP = 36;
      const schemaTables: ERSchemaTable[] = slice.map((t) => ({
        name: t.name,
        displayName: t.name,
        columns: (colsByTable[t.name] || []).slice(0, SCHEMA_ER_ATTR_CAP)
      }));

      const sourceHint =
        relationSource === 'fk'
          ? labelLanguage === 'zh'
            ? '基于外键/命名规则'
            : 'from FK/naming rules'
          : labelLanguage === 'zh'
            ? 'AI 推断'
            : 'AI inferred';
      const summary = `共 ${slice.length} 张表（每表：矩形实体 + 椭圆属性）；${rels.length} 条表间关系（菱形，${sourceHint}）；连线上为子表侧/父表侧基数，箭头指向父表`;

      setErSchemaDiagram({
        show: true,
        loading: false,
        databaseName: dbName,
        tables: schemaTables,
        relationships: rels,
        summary,
        labelLanguage
      });
    } catch (err: any) {
      setErSchemaDiagram((prev) => ({ ...prev, loading: false }));
      setToast({ message: `生成库 ER 图失败: ${err.message}`, type: 'error' });
    }
  };

  return {
    erDiagram,
    setERDiagram,
    erSchemaDiagram,
    setErSchemaDiagram,
    erLanguagePickTable,
    setErLanguagePickTable,
    erSchemaLanguagePickDb,
    setErSchemaLanguagePickDb,
    handleGenerateERDiagram,
    handleGenerateSchemaERDiagram
  };
};
