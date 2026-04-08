import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Maximize2, Minimize2, Pencil, Trash2, Undo2, X } from 'lucide-react';
import ConfirmModal from '../common/ConfirmModal';
import type { ERLabelLanguage } from './ERDiagramModal';

export type ERSchemaTable = {
  name: string;
  displayName: string;
  columns: string[];
};

/** 子表(from) → 父表(to)；菱形为语义名；连线上为基数（子表侧 / 父表侧） */
export type ERSchemaRelationship = {
  id: string;
  from: string;
  to: string;
  label: string;
  /** 靠近子表一侧（多为 N / 多） */
  fromCard: string;
  /** 靠近父表一侧（多为 1 / 一） */
  toCard: string;
};

type ERSchemaDiagramModalProps = {
  show: boolean;
  loading: boolean;
  databaseName: string;
  tables: ERSchemaTable[];
  relationships: ERSchemaRelationship[];
  summary: string;
  labelLanguage?: ERLabelLanguage;
  onClose: () => void;
};

type Point = { x: number; y: number };

const ATTR_RY = 24;
/** 库级图略紧凑，仍保持实体—属性间距 */
const SIDE_GAP = 100;
const SCHEMA_ATTR_CAP = 36;
const DRAG_THRESHOLD_PX = 6;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function measureEntityBox(label: string): { w: number; h: number } {
  if (typeof document === 'undefined') {
    return { w: 120, h: 44 };
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { w: 120, h: 44 };
  ctx.font = '700 16px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  const text = label || ' ';
  const tw = ctx.measureText(text).width;
  const padX = 28;
  const w = clamp(Math.ceil(tw + padX * 2), 72, 520);
  const h = 44;
  return { w, h };
}

function layoutAttributes(
  count: number,
  rectX: number,
  rectY: number,
  rectW: number,
  rectH: number
): Point[] {
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  const base = Math.floor(count / 4);
  const extra = count % 4;
  const perSide = sides.map((_, i) => base + (i < extra ? 1 : 0));
  const points: Point[] = [];
  let cursor = 0;
  sides.forEach((side, i) => {
    const k = perSide[i];
    for (let j = 0; j < k; j++) {
      const t = (j + 1) / (k + 1);
      if (side === 'top') {
        const x = rectX + rectW * t;
        points[cursor++] = { x, y: rectY - SIDE_GAP };
      } else if (side === 'right') {
        const y = rectY + rectH * t;
        points[cursor++] = { x: rectX + rectW + SIDE_GAP, y };
      } else if (side === 'bottom') {
        const x = rectX + rectW * t;
        points[cursor++] = { x, y: rectY + rectH + SIDE_GAP };
      } else {
        const y = rectY + rectH * t;
        points[cursor++] = { x: rectX - SIDE_GAP, y };
      }
    }
  });
  return points;
}

function getEntityAnchor(attrPos: Point, entityX: number, entityY: number, ew: number, eh: number): Point {
  const cx = entityX + ew / 2;
  const cy = entityY + eh / 2;
  const dx = attrPos.x - cx;
  const dy = attrPos.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0
      ? { x: entityX + ew, y: clamp(attrPos.y, entityY + 6, entityY + eh - 6) }
      : { x: entityX, y: clamp(attrPos.y, entityY + 6, entityY + eh - 6) };
  }
  return dy >= 0
    ? { x: clamp(attrPos.x, entityX + 6, entityX + ew - 6), y: entityY + eh }
    : { x: clamp(attrPos.x, entityX + 6, entityX + ew - 6), y: entityY };
}

function measureTextWidth(text: string, font: string): number {
  if (typeof document === 'undefined') return text.length * 7;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

function diamondPoints(cx: number, cy: number, rw: number, rh: number): string {
  return `${cx},${cy - rh} ${cx + rw},${cy} ${cx},${cy + rh} ${cx - rw},${cy}`;
}

function rectEdgeToward(cx: number, cy: number, hw: number, hh: number, tx: number, ty: number) {
  const dx = tx - cx;
  const dy = ty - cy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: cx, y: cy };
  const ux = dx / len;
  const uy = dy / len;
  const t = Math.min(hw / (Math.abs(ux) + 1e-9), hh / (Math.abs(uy) + 1e-9));
  return { x: cx + ux * t, y: cy + uy * t };
}

function segPoint(ax: number, ay: number, bx: number, by: number, t: number) {
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
}

type EntityLayout = {
  ex: number;
  ey: number;
  ew: number;
  eh: number;
  cx: number;
  cy: number;
};

type RelLayout = {
  id: string;
  from: string;
  to: string;
  label: string;
  fromCard: string;
  toCard: string;
  dx: number;
  dy: number;
  rw: number;
  rh: number;
  childEdge: Point;
  parentEdge: Point;
  fromCardPos: Point;
  toCardPos: Point;
};

type EditableTable = {
  id: string;
  name: string;
  displayName: string;
  columns: { id: string; name: string }[];
};
type SelectedTarget =
  | { type: 'entity'; tableId: string }
  | { type: 'attr'; tableId: string; index: number }
  | { type: 'rel'; relId: string }
  | null;
type DragTarget =
  | { type: 'entity'; tableId: string }
  | { type: 'attr'; tableId: string; index: number }
  | { type: 'rel'; relId: string }
  | null;
type TextEditTarget =
  | { kind: 'entity'; tableId: string }
  | { kind: 'attr'; tableId: string; index: number }
  | { kind: 'rel'; relId: string }
  | null;

type Snapshot = {
  tables: EditableTable[];
  entityPos: Record<string, Point>;
  attrPos: Record<string, Point[]>;
  relPos: Record<string, Point>;
  relText: Record<string, { label: string; fromCard: string; toCard: string }>;
  selected: SelectedTarget;
};

type PendingDrag =
  | { kind: 'entity'; tableId: string; startClient: Point; originEntity: Point }
  | { kind: 'attr'; tableId: string; index: number; startClient: Point; originAttr: Point }
  | { kind: 'rel'; relId: string; startClient: Point; originRel: Point };

const ERSchemaDiagramModal: React.FC<ERSchemaDiagramModalProps> = ({
  show,
  loading,
  databaseName,
  tables,
  relationships,
  summary,
  labelLanguage = 'zh',
  onClose
}) => {
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [tablesState, setTablesState] = useState<EditableTable[]>([]);
  const [entityPos, setEntityPos] = useState<Record<string, Point>>({});
  const [attrPos, setAttrPos] = useState<Record<string, Point[]>>({});
  const [relPos, setRelPos] = useState<Record<string, Point>>({});
  const [relText, setRelText] = useState<Record<string, { label: string; fromCard: string; toCard: string }>>({});
  const [selected, setSelected] = useState<SelectedTarget>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const pendingDragRef = useRef<PendingDrag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [textEdit, setTextEdit] = useState<TextEditTarget>(null);
  const [textDraft, setTextDraft] = useState('');
  const [relDraft, setRelDraft] = useState({ label: '', fromCard: '', toCard: '' });
  const textInputRef = useRef<HTMLInputElement>(null);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canvasScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show) setCloseConfirmOpen(false);
  }, [show]);

  useEffect(() => {
    if (!show) {
      setZoom(1);
      setIsFullscreen(false);
    }
  }, [show]);

  const initLayout = useCallback(() => {
    const rawTables = tables;
    const editable: EditableTable[] = rawTables.map((t, ti) => ({
      id: `tbl-${ti}-${t.name}`,
      name: t.name,
      displayName: t.displayName,
      columns: (t.columns || []).slice(0, SCHEMA_ATTR_CAP).map((c, ci) => ({ id: `col-${ti}-${ci}`, name: c }))
    }));

    const n = editable.length;
    const COLS = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, n))));
    const CELL_W = 560;
    const CELL_H = 520;
    const PAD = 64;

    const ep: Record<string, Point> = {};
    const ap: Record<string, Point[]> = {};
    editable.forEach((t, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cellCX = PAD + col * CELL_W + CELL_W / 2;
      const cellCY = PAD + row * CELL_H + CELL_H / 2;
      const label = t.displayName || t.name;
      const { w: ew, h: eh } = measureEntityBox(label);
      const ex = cellCX - ew / 2;
      const ey = cellCY - eh / 2;
      ep[t.id] = { x: ex, y: ey };
      ap[t.id] = layoutAttributes(t.columns.length, ex, ey, ew, eh);
    });

    const rp: Record<string, Point> = {};
    const rt: Record<string, { label: string; fromCard: string; toCard: string }> = {};

    const idByName = new Map<string, string>();
    editable.forEach((t) => idByName.set(t.name, t.id));

    const defaultFrom = labelLanguage === 'zh' ? '多' : 'N';
    const defaultTo = labelLanguage === 'zh' ? '一' : '1';

    // relationship diamond initial position: mid of two entity centers, with small perpendicular offset per pair
    const pairCount = new Map<string, number>();
    for (const rel of relationships) {
      const fromId = idByName.get(rel.from);
      const toId = idByName.get(rel.to);
      if (!fromId || !toId) continue;
      const fromT = editable.find((t) => t.id === fromId);
      const toT = editable.find((t) => t.id === toId);
      if (!fromT || !toT) continue;
      const fromLabel = fromT.displayName || fromT.name;
      const toLabel = toT.displayName || toT.name;
      const { w: fw, h: fh } = measureEntityBox(fromLabel);
      const { w: tw, h: th } = measureEntityBox(toLabel);
      const fp = ep[fromId];
      const tp = ep[toId];
      const fcx = fp.x + fw / 2;
      const fcy = fp.y + fh / 2;
      const tcx = tp.x + tw / 2;
      const tcy = tp.y + th / 2;

      const key = [fromId, toId].sort().join('|');
      const idx = pairCount.get(key) ?? 0;
      pairCount.set(key, idx + 1);

      const mx = (fcx + tcx) / 2;
      const my = (fcy + tcy) / 2;
      const vx = tcx - fcx;
      const vy = tcy - fcy;
      const len = Math.hypot(vx, vy) || 1;
      const px = -vy / len;
      const py = vx / len;
      const off = idx * 30;
      rp[rel.id] = { x: mx + px * off, y: my + py * off };
      rt[rel.id] = {
        label: rel.label,
        fromCard: rel.fromCard || defaultFrom,
        toCard: rel.toCard || defaultTo
      };
    }

    setTablesState(editable);
    setEntityPos(ep);
    setAttrPos(ap);
    setRelPos(rp);
    setRelText(rt);
    setSelected(null);
    setDragTarget(null);
    pendingDragRef.current = null;
    setHistory([]);
    setTextEdit(null);
    setTextDraft('');
    setRelDraft({ label: '', fromCard: '', toCard: '' });
  }, [tables, relationships, labelLanguage]);

  useEffect(() => {
    if (!show) return;
    initLayout();
  }, [show, initLayout]);

  const svgW = useMemo(() => {
    const n = tablesState.length;
    if (n === 0) return 800;
    const COLS = Math.max(1, Math.ceil(Math.sqrt(n)));
    const ROWS = Math.ceil(n / COLS);
    const CELL_W = 560;
    const PAD = 64;
    return PAD * 2 + COLS * CELL_W;
  }, [tablesState.length]);
  const svgH = useMemo(() => {
    const n = tablesState.length;
    if (n === 0) return 600;
    const COLS = Math.max(1, Math.ceil(Math.sqrt(n)));
    const ROWS = Math.ceil(n / COLS);
    const CELL_H = 520;
    const PAD = 64;
    return PAD * 2 + ROWS * CELL_H;
  }, [tablesState.length]);

  const pushHistory = useCallback(() => {
    setHistory((prev) => [
      ...prev.slice(-39),
      {
        tables: tablesState.map((t) => ({ ...t, columns: t.columns.map((c) => ({ ...c })) })),
        entityPos: JSON.parse(JSON.stringify(entityPos)),
        attrPos: JSON.parse(JSON.stringify(attrPos)),
        relPos: JSON.parse(JSON.stringify(relPos)),
        relText: JSON.parse(JSON.stringify(relText)),
        selected
      }
    ]);
  }, [tablesState, entityPos, attrPos, relPos, relText, selected]);

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setTablesState(last.tables);
      setEntityPos(last.entityPos);
      setAttrPos(last.attrPos);
      setRelPos(last.relPos);
      setRelText(last.relText);
      setSelected(last.selected);
      setDragTarget(null);
      pendingDragRef.current = null;
      return prev.slice(0, -1);
    });
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (!selected) return;
    pushHistory();
    if (selected.type === 'rel') {
      const rid = selected.relId;
      setRelPos((p) => {
        const { [rid]: _, ...rest } = p;
        return rest;
      });
      setRelText((p) => {
        const { [rid]: _, ...rest } = p;
        return rest;
      });
      // also remove relationship from props-backed list by filtering at render-time (tablesState/relText drive visuals)
      setSelected(null);
      return;
    }
    if (selected.type === 'attr') {
      const { tableId, index } = selected;
      setTablesState((prev) =>
        prev.map((t) => (t.id === tableId ? { ...t, columns: t.columns.filter((_, i) => i !== index) } : t))
      );
      setAttrPos((prev) => ({
        ...prev,
        [tableId]: (prev[tableId] || []).filter((_, i) => i !== index)
      }));
      setSelected(null);
      return;
    }
    if (selected.type === 'entity') {
      const tid = selected.tableId;
      const tbl = tablesState.find((t) => t.id === tid);
      setTablesState((prev) => prev.filter((t) => t.id !== tid));
      setEntityPos((prev) => {
        const { [tid]: _, ...rest } = prev;
        return rest;
      });
      setAttrPos((prev) => {
        const { [tid]: _, ...rest } = prev;
        return rest;
      });
      // remove relationships involving this table name
      if (tbl) {
        const name = tbl.name;
        const idsToRemove = relationships
          .filter((r) => r.from === name || r.to === name)
          .map((r) => r.id);
        setRelPos((prev) => {
          const out = { ...prev };
          idsToRemove.forEach((id) => delete out[id]);
          return out;
        });
        setRelText((prev) => {
          const out = { ...prev };
          idsToRemove.forEach((id) => delete out[id]);
          return out;
        });
      }
      setSelected(null);
    }
  }, [selected, pushHistory, tablesState, relationships]);

  const openTextEdit = useCallback(
    (target: TextEditTarget) => {
      setDragTarget(null);
      pendingDragRef.current = null;
      setTextEdit(target);
      if (!target) return;
      if (target.kind === 'entity') {
        const t = tablesState.find((x) => x.id === target.tableId);
        setTextDraft((t?.displayName || t?.name || '').trim());
        setRelDraft({ label: '', fromCard: '', toCard: '' });
      } else if (target.kind === 'attr') {
        const t = tablesState.find((x) => x.id === target.tableId);
        const c = t?.columns[target.index];
        setTextDraft((c?.name || '').trim());
        setRelDraft({ label: '', fromCard: '', toCard: '' });
      } else {
        const r = relText[target.relId] || { label: '', fromCard: '', toCard: '' };
        setRelDraft({ label: r.label || '', fromCard: r.fromCard || '', toCard: r.toCard || '' });
        setTextDraft('');
      }
    },
    [tablesState, relText]
  );

  const applyTextEdit = useCallback(() => {
    if (!textEdit) return;
    pushHistory();
    if (textEdit.kind === 'entity') {
      const trimmed = textDraft.trim();
      setTablesState((prev) =>
        prev.map((t) => (t.id === textEdit.tableId ? { ...t, displayName: trimmed || t.displayName || t.name } : t))
      );
    } else if (textEdit.kind === 'attr') {
      const trimmed = textDraft.trim();
      setTablesState((prev) =>
        prev.map((t) =>
          t.id === textEdit.tableId
            ? { ...t, columns: t.columns.map((c, i) => (i === textEdit.index ? { ...c, name: trimmed || c.name } : c)) }
            : t
        )
      );
    } else if (textEdit.kind === 'rel') {
      setRelText((prev) => ({
        ...prev,
        [textEdit.relId]: {
          label: relDraft.label.trim() || prev[textEdit.relId]?.label || '',
          fromCard: relDraft.fromCard.trim() || prev[textEdit.relId]?.fromCard || '',
          toCard: relDraft.toCard.trim() || prev[textEdit.relId]?.toCard || ''
        }
      }));
    }
    setTextEdit(null);
    setTextDraft('');
    setRelDraft({ label: '', fromCard: '', toCard: '' });
  }, [textEdit, textDraft, relDraft, pushHistory]);

  const cancelTextEdit = useCallback(() => {
    setTextEdit(null);
    setTextDraft('');
    setRelDraft({ label: '', fromCard: '', toCard: '' });
  }, []);

  useEffect(() => {
    if (!textEdit) return;
    const t = requestAnimationFrame(() => {
      textInputRef.current?.focus();
      textInputRef.current?.select();
    });
    return () => cancelAnimationFrame(t);
  }, [textEdit]);

  const getSvgPoint = (clientX: number, clientY: number): Point | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const scaleX = svgW / rect.width;
    const scaleY = svgH / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const beginEntityPointerDown = (tableId: string, e: React.MouseEvent) => {
    if (e.detail === 2) {
      e.preventDefault();
      e.stopPropagation();
      setSelected({ type: 'entity', tableId });
      openTextEdit({ kind: 'entity', tableId });
      return;
    }
    if (e.detail > 2) return;
    pendingDragRef.current = {
      kind: 'entity',
      tableId,
      startClient: { x: e.clientX, y: e.clientY },
      originEntity: { ...(entityPos[tableId] || { x: 0, y: 0 }) }
    };
    setSelected({ type: 'entity', tableId });
  };

  const beginAttrPointerDown = (tableId: string, index: number, e: React.MouseEvent) => {
    if (e.detail === 2) {
      e.preventDefault();
      e.stopPropagation();
      setSelected({ type: 'attr', tableId, index });
      openTextEdit({ kind: 'attr', tableId, index });
      return;
    }
    if (e.detail > 2) return;
    const origin = (attrPos[tableId] || [])[index];
    if (!origin) return;
    pendingDragRef.current = {
      kind: 'attr',
      tableId,
      index,
      startClient: { x: e.clientX, y: e.clientY },
      originAttr: { ...origin }
    };
    setSelected({ type: 'attr', tableId, index });
  };

  const beginRelPointerDown = (relId: string, e: React.MouseEvent) => {
    if (e.detail === 2) {
      e.preventDefault();
      e.stopPropagation();
      setSelected({ type: 'rel', relId });
      openTextEdit({ kind: 'rel', relId });
      return;
    }
    if (e.detail > 2) return;
    const origin = relPos[relId];
    if (!origin) return;
    pendingDragRef.current = {
      kind: 'rel',
      relId,
      startClient: { x: e.clientX, y: e.clientY },
      originRel: { ...origin }
    };
    setSelected({ type: 'rel', relId });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const pending = pendingDragRef.current;
    if (pending && !dragTarget) {
      const dx = e.clientX - pending.startClient.x;
      const dy = e.clientY - pending.startClient.y;
      if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        pushHistory();
        if (pending.kind === 'entity') setDragTarget({ type: 'entity', tableId: pending.tableId });
        if (pending.kind === 'attr') setDragTarget({ type: 'attr', tableId: pending.tableId, index: pending.index });
        if (pending.kind === 'rel') setDragTarget({ type: 'rel', relId: pending.relId });
        pendingDragRef.current = null;
      }
    }

    if (!dragTarget) return;
    const p = getSvgPoint(e.clientX, e.clientY);
    if (!p) return;

    if (dragTarget.type === 'entity') {
      setEntityPos((prev) => ({ ...prev, [dragTarget.tableId]: { x: p.x, y: p.y } }));
      return;
    }
    if (dragTarget.type === 'attr') {
      setAttrPos((prev) => ({
        ...prev,
        [dragTarget.tableId]: (prev[dragTarget.tableId] || []).map((pt, i) =>
          i === dragTarget.index ? { x: p.x, y: p.y } : pt
        )
      }));
      return;
    }
    if (dragTarget.type === 'rel') {
      setRelPos((prev) => ({ ...prev, [dragTarget.relId]: { x: p.x, y: p.y } }));
    }
  };

  const stopDrag = () => {
    setDragTarget(null);
    pendingDragRef.current = null;
  };

  const handleEditSelected = () => {
    if (!selected) return;
    if (selected.type === 'entity') return openTextEdit({ kind: 'entity', tableId: selected.tableId });
    if (selected.type === 'attr') return openTextEdit({ kind: 'attr', tableId: selected.tableId, index: selected.index });
    return openTextEdit({ kind: 'rel', relId: selected.relId });
  };

  useEffect(() => {
    if (!show) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const t = e.target as HTMLElement;
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
        handleDeleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [show, handleUndo, handleDeleteSelected]);

  const langHint =
    labelLanguage === 'zh'
      ? '每表为实体（矩形）+ 属性（椭圆）；表间以菱形联系，连线标注基数（多对一）'
      : 'Each table: entity (rectangle) + attributes (ellipses); relationships are diamonds with cardinality on edges';

  const handleCanvasWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!canvasScrollRef.current) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    const nextZoom = clamp(Number((zoom + delta).toFixed(2)), MIN_ZOOM, MAX_ZOOM);
    if (nextZoom === zoom) return;
    const container = canvasScrollRef.current;
    const rect = container.getBoundingClientRect();
    const px = e.clientX - rect.left + container.scrollLeft;
    const py = e.clientY - rect.top + container.scrollTop;
    const ratio = nextZoom / zoom;
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      container.scrollLeft = px * ratio - (e.clientX - rect.left);
      container.scrollTop = py * ratio - (e.clientY - rect.top);
    });
  };

  return (
    <>
      <ConfirmModal
        show={closeConfirmOpen}
        title="关闭 ER 图"
        message="确定要关闭库级 ER 图画布吗？"
        type="warning"
        overlayZClass="z-[350]"
        onConfirm={() => onClose()}
        onCancel={() => setCloseConfirmOpen(false)}
      />
      <AnimatePresence>
        {show && (
          <div className={`fixed inset-0 z-[230] flex items-center justify-center ${isFullscreen ? 'p-0' : 'p-5'}`}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCloseConfirmOpen(true)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className={`relative z-10 bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden ${
                isFullscreen
                  ? 'w-screen h-screen rounded-none'
                  : 'w-[94vw] max-w-[1600px] h-[88vh] rounded-3xl'
              }`}
            >
              {textEdit && (
                <div
                  className="absolute inset-0 z-[300] flex items-center justify-center bg-slate-900/25 rounded-3xl p-4"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={cancelTextEdit}
                >
                  <div
                    className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-sm p-5"
                    onClick={(e) => e.stopPropagation()}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="er-schema-text-edit-title"
                  >
                    <h4 id="er-schema-text-edit-title" className="text-sm font-bold text-slate-900 mb-3">
                      {textEdit.kind === 'entity'
                        ? '编辑实体名称'
                        : textEdit.kind === 'attr'
                          ? '编辑属性名称'
                          : '编辑关系'}
                    </h4>
                    {textEdit.kind === 'rel' ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={relDraft.label}
                          onChange={(e) => setRelDraft((p) => ({ ...p, label: e.target.value }))}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                          placeholder="关系名（菱形内）"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            ref={textInputRef}
                            type="text"
                            value={relDraft.fromCard}
                            onChange={(e) => setRelDraft((p) => ({ ...p, fromCard: e.target.value }))}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                            placeholder={labelLanguage === 'zh' ? '子表侧基数（如 N）' : 'child side (e.g. N)'}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                applyTextEdit();
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelTextEdit();
                              }
                            }}
                          />
                          <input
                            type="text"
                            value={relDraft.toCard}
                            onChange={(e) => setRelDraft((p) => ({ ...p, toCard: e.target.value }))}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                            placeholder={labelLanguage === 'zh' ? '父表侧基数（如 1）' : 'parent side (e.g. 1)'}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                applyTextEdit();
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelTextEdit();
                              }
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <input
                        ref={textInputRef}
                        type="text"
                        value={textDraft}
                        onChange={(e) => setTextDraft(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            applyTextEdit();
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelTextEdit();
                          }
                        }}
                      />
                    )}
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        onClick={cancelTextEdit}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
                        onClick={() => applyTextEdit()}
                      >
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-b from-slate-50 to-transparent">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">库 ER 图 — {databaseName}</h3>
                  <p className="text-xs text-slate-500">{summary || langHint}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleEditSelected}
                    disabled={!selected}
                    className="h-8 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                    title="编辑选中图形文字"
                  >
                    <Pencil size={14} /> 编辑
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    disabled={!selected}
                    className="h-8 px-3 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                    title="删除选中图形"
                  >
                    <Trash2 size={14} /> 删除
                  </button>
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={history.length === 0}
                    className="h-8 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                    title="撤销上一步"
                  >
                    <Undo2 size={14} /> 撤销
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFullscreen((v) => !v)}
                    className="h-8 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
                    title={isFullscreen ? '退出全屏' : '全屏画布'}
                  >
                    {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    {isFullscreen ? '退出全屏' : '全屏'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div
                ref={canvasScrollRef}
                className="flex-1 bg-slate-50 overflow-auto"
                onWheel={handleCanvasWheel}
              >
                {loading ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-500">
                    <Loader2 size={22} className="animate-spin text-blue-600" />
                    <span className="text-sm">正在读取表结构与外键并生成库级 ER 图…</span>
                  </div>
                ) : tablesState.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
                    <span>当前库中暂无数据表</span>
                  </div>
                ) : (
                  <svg
                    ref={svgRef}
                    width={Math.round(svgW * zoom)}
                    height={Math.round(svgH * zoom)}
                    className="mx-auto my-4 block select-none min-w-0"
                    viewBox={`0 0 ${svgW} ${svgH}`}
                    onMouseDown={(e) => {
                      if (e.target === e.currentTarget) {
                        setSelected(null);
                        setDragTarget(null);
                        pendingDragRef.current = null;
                      }
                    }}
                    onMouseMove={handleMouseMove}
                    onMouseUp={stopDrag}
                    onMouseLeave={stopDrag}
                  >
                    {/* 每表：实体矩形 + 属性椭圆（样式与单表 ER 一致，并支持交互） */}
                    {tablesState.map((t) => {
                      const p = entityPos[t.id];
                      if (!p) return null;
                      const label = t.displayName || t.name;
                      const { w: ew, h: eh } = measureEntityBox(label);
                      const posList = attrPos[t.id] || layoutAttributes(t.columns.length, p.x, p.y, ew, eh);
                      const selectedEntity = selected?.type === 'entity' && selected.tableId === t.id;

                      return (
                        <g key={t.id} className="er-schema-cluster">
                          <rect
                            x={p.x}
                            y={p.y}
                            width={ew}
                            height={eh}
                            rx={10}
                            fill="none"
                            stroke={selectedEntity ? '#2563eb' : '#334155'}
                            strokeWidth={2}
                            className="cursor-move"
                            onMouseDown={(e) => beginEntityPointerDown(t.id, e)}
                          />
                          <text
                            x={p.x + ew / 2}
                            y={p.y + eh / 2 + 5}
                            textAnchor="middle"
                            className="fill-slate-800 cursor-move"
                            style={{ pointerEvents: 'auto' }}
                            fontSize="16"
                            fontWeight="700"
                            onMouseDown={(e) => beginEntityPointerDown(t.id, e)}
                          >
                            {label}
                          </text>

                          {t.columns.map((c, i) => {
                            const ap = posList[i];
                            if (!ap) return null;
                            const anchor = getEntityAnchor(ap, p.x, p.y, ew, eh);
                            const selectedAttr = selected?.type === 'attr' && selected.tableId === t.id && selected.index === i;
                            const rx = Math.min(120, Math.max(58, 20 + c.name.length * 3.4));
                            return (
                              <g key={c.id}>
                                <line x1={anchor.x} y1={anchor.y} x2={ap.x} y2={ap.y} stroke="#94a3b8" strokeWidth={1.5} />
                                <ellipse
                                  cx={ap.x}
                                  cy={ap.y}
                                  rx={rx}
                                  ry={ATTR_RY}
                                  fill="#fff"
                                  stroke={selectedAttr ? '#2563eb' : '#334155'}
                                  strokeWidth={1.6}
                                  className="cursor-move"
                                  onMouseDown={(e) => beginAttrPointerDown(t.id, i, e)}
                                />
                                <text
                                  x={ap.x}
                                  y={ap.y + 4}
                                  textAnchor="middle"
                                  className="fill-slate-700 cursor-move"
                                  style={{ pointerEvents: 'auto' }}
                                  fontSize="12"
                                  fontWeight="600"
                                  onMouseDown={(e) => beginAttrPointerDown(t.id, i, e)}
                                >
                                  {c.name}
                                </text>
                              </g>
                            );
                          })}
                        </g>
                      );
                    })}

                    {/* 表间：菱形 + 连线 + 基数（最后绘制以免被实体遮挡） */}
                    <g className="er-schema-inter-table">
                      {relationships
                        .filter((r) => relPos[r.id] && relText[r.id])
                        .map((r) => {
                          const diamond = relPos[r.id];
                          const txt = relText[r.id];
                          const fromTable = tablesState.find((t) => t.name === r.from);
                          const toTable = tablesState.find((t) => t.name === r.to);
                          if (!fromTable || !toTable) return null;
                          const fp = entityPos[fromTable.id];
                          const tp = entityPos[toTable.id];
                          if (!fp || !tp) return null;
                          const fl = fromTable.displayName || fromTable.name;
                          const tl = toTable.displayName || toTable.name;
                          const { w: fw, h: fh } = measureEntityBox(fl);
                          const { w: tw, h: th } = measureEntityBox(tl);
                          const fcx = fp.x + fw / 2;
                          const fcy = fp.y + fh / 2;
                          const tcx = tp.x + tw / 2;
                          const tcy = tp.y + th / 2;
                          const childEdge = rectEdgeToward(fcx, fcy, fw / 2, fh / 2, diamond.x, diamond.y);
                          const parentEdge = rectEdgeToward(tcx, tcy, tw / 2, th / 2, diamond.x, diamond.y);
                          const fromCardPos = segPoint(childEdge.x, childEdge.y, diamond.x, diamond.y, 0.38);
                          const toCardPos = segPoint(diamond.x, diamond.y, parentEdge.x, parentEdge.y, 0.62);
                          const lw = measureTextWidth(txt.label || '', '600 11px ui-sans-serif, system-ui, sans-serif');
                          const rw = Math.min(88, Math.max(34, lw / 2 + 12));
                          const rh = 22;
                          const selectedRel = selected?.type === 'rel' && selected.relId === r.id;

                          return (
                            <g key={`inter-${r.id}`}>
                              <line x1={childEdge.x} y1={childEdge.y} x2={diamond.x} y2={diamond.y} stroke="#94a3b8" strokeWidth={1.6} />
                              <line
                                x1={diamond.x}
                                y1={diamond.y}
                                x2={parentEdge.x}
                                y2={parentEdge.y}
                                stroke="#94a3b8"
                                strokeWidth={1.6}
                              />
                              <text
                                x={fromCardPos.x}
                                y={fromCardPos.y + 3}
                                textAnchor="middle"
                                className="fill-slate-600 pointer-events-none"
                                fontSize="10"
                                fontWeight="700"
                              >
                                {txt.fromCard}
                              </text>
                              <text
                                x={toCardPos.x}
                                y={toCardPos.y + 3}
                                textAnchor="middle"
                                className="fill-slate-600 pointer-events-none"
                                fontSize="10"
                                fontWeight="700"
                              >
                                {txt.toCard}
                              </text>
                              <polygon
                                points={diamondPoints(diamond.x, diamond.y, rw, rh)}
                                fill="#fff"
                                stroke="#111827"
                                strokeWidth={2.2}
                                className="cursor-move"
                                onMouseDown={(e) => beginRelPointerDown(r.id, e)}
                              />
                              <text
                                x={diamond.x}
                                y={diamond.y + 4}
                                textAnchor="middle"
                                className="fill-slate-700 cursor-move"
                                style={{ pointerEvents: 'auto' }}
                                fontSize="11"
                                fontWeight="700"
                                onMouseDown={(e) => beginRelPointerDown(r.id, e)}
                              >
                                {txt.label}
                              </text>
                            </g>
                          );
                        })}
                    </g>
                  </svg>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ERSchemaDiagramModal;
