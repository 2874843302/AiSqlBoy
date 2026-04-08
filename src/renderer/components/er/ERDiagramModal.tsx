import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Pencil, Trash2, Undo2, X } from 'lucide-react';
import ConfirmModal from '../common/ConfirmModal';

export type ERAttribute = {
  name: string;
  type?: string;
  key?: 'PK' | 'FK' | 'UK' | 'NONE' | string;
};

export type ERLabelLanguage = 'zh' | 'en';

type ERDiagramModalProps = {
  show: boolean;
  loading: boolean;
  tableName: string;
  /** AI 返回的实体展示名；未提供时用 tableName */
  entityDisplayName?: string;
  attributes: ERAttribute[];
  sourceSql: string;
  labelLanguage?: ERLabelLanguage;
  onClose: () => void;
};

type Point = { x: number; y: number };
type DragTarget = { type: 'entity' } | { type: 'attr'; index: number } | null;
type SelectedTarget = { type: 'entity' } | { type: 'attr'; index: number } | null;
type EditableAttribute = ERAttribute & { id: string };
type Snapshot = {
  entityLabel: string;
  attributes: EditableAttribute[];
  positions: Point[];
};

const SIDE_GAP = 150;
const SVG_WIDTH = 1100;
const SVG_HEIGHT = 760;
const ATTR_RY = 24;
const DRAG_THRESHOLD_PX = 6;

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

const layoutAttributes = (count: number, rectX: number, rectY: number, rectW: number, rectH: number): Point[] => {
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
};

type PendingDrag =
  | { kind: 'entity'; startClient: Point; originEntity: Point }
  | { kind: 'attr'; index: number; startClient: Point; originPositions: Point[] };

const ERDiagramModal: React.FC<ERDiagramModalProps> = ({
  show,
  loading,
  tableName,
  entityDisplayName,
  attributes,
  sourceSql,
  labelLanguage = 'zh',
  onClose
}) => {
  const initialBox = useMemo(() => measureEntityBox(tableName), [tableName]);
  const initialEntityPos = useMemo(
    () => ({ x: (SVG_WIDTH - initialBox.w) / 2, y: (SVG_HEIGHT - initialBox.h) / 2 }),
    [initialBox.w, initialBox.h]
  );
  const initialAttrPos = useMemo(
    () => layoutAttributes(attributes.length, initialEntityPos.x, initialEntityPos.y, initialBox.w, initialBox.h),
    [attributes.length, initialEntityPos.x, initialEntityPos.y, initialBox.w, initialBox.h]
  );

  const [entityPos, setEntityPos] = useState<Point>(initialEntityPos);
  const [attributePositions, setAttributePositions] = useState<Point[]>(initialAttrPos);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [selected, setSelected] = useState<SelectedTarget>(null);
  const [entityLabel, setEntityLabel] = useState(tableName);
  const [editableAttributes, setEditableAttributes] = useState<EditableAttribute[]>(
    attributes.map((a, i) => ({ ...a, id: `attr-${i}` }))
  );
  const [history, setHistory] = useState<Snapshot[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const pendingDragRef = useRef<PendingDrag | null>(null);
  /** Electron 下 window.prompt 常不可用，用内置编辑层 */
  const [textEdit, setTextEdit] = useState<null | { kind: 'entity' } | { kind: 'attr'; index: number }>(null);
  const [textDraft, setTextDraft] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const entityBox = useMemo(() => measureEntityBox(entityLabel), [entityLabel]);

  const pushHistory = useCallback(() => {
    setHistory((prev) => [
      ...prev.slice(-39),
      {
        entityLabel,
        attributes: editableAttributes.map((a) => ({ ...a })),
        positions: attributePositions.map((p) => ({ ...p }))
      }
    ]);
  }, [entityLabel, editableAttributes, attributePositions]);

  const getEntityAnchor = useCallback(
    (attrPos: Point, ew: number, eh: number): Point => {
      const cx = entityPos.x + ew / 2;
      const cy = entityPos.y + eh / 2;
      const dx = attrPos.x - cx;
      const dy = attrPos.y - cy;

      if (Math.abs(dx) > Math.abs(dy)) {
        return dx >= 0
          ? { x: entityPos.x + ew, y: clamp(attrPos.y, entityPos.y + 6, entityPos.y + eh - 6) }
          : { x: entityPos.x, y: clamp(attrPos.y, entityPos.y + 6, entityPos.y + eh - 6) };
      }
      return dy >= 0
        ? { x: clamp(attrPos.x, entityPos.x + 6, entityPos.x + ew - 6), y: entityPos.y + eh }
        : { x: clamp(attrPos.x, entityPos.x + 6, entityPos.x + ew - 6), y: entityPos.y };
    },
    [entityPos.x, entityPos.y]
  );

  const openTextEdit = useCallback(
    (kind: 'entity' | 'attr', attrIndex?: number) => {
      setDragTarget(null);
      pendingDragRef.current = null;
      if (kind === 'entity') {
        setTextDraft(entityLabel);
        setTextEdit({ kind: 'entity' });
        return;
      }
      if (attrIndex === undefined) return;
      const row = editableAttributes[attrIndex];
      if (!row) return;
      setTextDraft(row.name);
      setTextEdit({ kind: 'attr', index: attrIndex });
    },
    [entityLabel, editableAttributes]
  );

  const applyTextEdit = useCallback(() => {
    if (!textEdit) return;
    const trimmed = textDraft.trim();
    if (textEdit.kind === 'entity') {
      if (trimmed === entityLabel) {
        setTextEdit(null);
        return;
      }
      pushHistory();
      setEntityLabel(trimmed || entityLabel);
      setTextEdit(null);
      return;
    }
    const idx = textEdit.index;
    const current = editableAttributes[idx];
    if (!current) {
      setTextEdit(null);
      return;
    }
    if (trimmed === current.name) {
      setTextEdit(null);
      return;
    }
    pushHistory();
    setEditableAttributes((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, name: trimmed || a.name } : a))
    );
    setTextEdit(null);
  }, [textEdit, textDraft, entityLabel, editableAttributes, pushHistory]);

  const cancelTextEdit = useCallback(() => {
    setTextEdit(null);
    setTextDraft('');
  }, []);

  useEffect(() => {
    if (!textEdit) return;
    const t = requestAnimationFrame(() => {
      textInputRef.current?.focus();
      textInputRef.current?.select();
    });
    return () => cancelAnimationFrame(t);
  }, [textEdit]);

  const handleDeleteSelected = useCallback(() => {
    if (!selected) return;
    pushHistory();
    if (selected.type === 'entity') {
      setEntityLabel('');
      setSelected(null);
      return;
    }
    setEditableAttributes((prev) => prev.filter((_, i) => i !== selected.index));
    setAttributePositions((prev) => prev.filter((_, i) => i !== selected.index));
    setSelected(null);
  }, [selected, pushHistory]);

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setEntityLabel(last.entityLabel);
      setEditableAttributes(last.attributes.map((a) => ({ ...a })));
      setAttributePositions(last.positions.map((p) => ({ ...p })));
      setSelected(null);
      return prev.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    if (!show) return;
    const labelForBox = (entityDisplayName?.trim() ? entityDisplayName : tableName) || tableName;
    const box = measureEntityBox(labelForBox);
    const pos = { x: (SVG_WIDTH - box.w) / 2, y: (SVG_HEIGHT - box.h) / 2 };
    setEntityPos(pos);
    setAttributePositions(layoutAttributes(attributes.length, pos.x, pos.y, box.w, box.h));
    setDragTarget(null);
    pendingDragRef.current = null;
    setSelected(null);
    setEntityLabel(labelForBox);
    setEditableAttributes(attributes.map((a, i) => ({ ...a, id: `attr-${i}` })));
    setHistory([]);
  }, [show, tableName, entityDisplayName, attributes]);

  useEffect(() => {
    if (!show) setCloseConfirmOpen(false);
  }, [show]);

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

  const getSvgPoint = (clientX: number, clientY: number): Point | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const scaleX = SVG_WIDTH / rect.width;
    const scaleY = SVG_HEIGHT / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const beginEntityPointerDown = (e: React.MouseEvent) => {
    if (e.detail === 2) {
      e.preventDefault();
      e.stopPropagation();
      pendingDragRef.current = null;
      setDragTarget(null);
      setSelected({ type: 'entity' });
      openTextEdit('entity');
      return;
    }
    if (e.detail > 2) return;
    pendingDragRef.current = {
      kind: 'entity',
      startClient: { x: e.clientX, y: e.clientY },
      originEntity: { ...entityPos }
    };
    setSelected({ type: 'entity' });
  };

  const beginAttrPointerDown = (index: number, e: React.MouseEvent) => {
    if (e.detail === 2) {
      e.preventDefault();
      e.stopPropagation();
      pendingDragRef.current = null;
      setDragTarget(null);
      setSelected({ type: 'attr', index });
      openTextEdit('attr', index);
      return;
    }
    if (e.detail > 2) return;
    pendingDragRef.current = {
      kind: 'attr',
      index,
      startClient: { x: e.clientX, y: e.clientY },
      originPositions: attributePositions.map((p) => ({ ...p }))
    };
    setSelected({ type: 'attr', index });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const pending = pendingDragRef.current;
    if (pending && !dragTarget) {
      const dx = e.clientX - pending.startClient.x;
      const dy = e.clientY - pending.startClient.y;
      if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        pushHistory();
        if (pending.kind === 'entity') {
          setDragTarget({ type: 'entity' });
        } else {
          setDragTarget({ type: 'attr', index: pending.index });
        }
        pendingDragRef.current = null;
      }
    }

    if (!dragTarget) return;
    const p = getSvgPoint(e.clientX, e.clientY);
    if (!p) return;

    const ew = entityBox.w;
    const eh = entityBox.h;

    if (dragTarget.type === 'entity') {
      setEntityPos({
        x: clamp(p.x - ew / 2, 30, SVG_WIDTH - ew - 30),
        y: clamp(p.y - eh / 2, 30, SVG_HEIGHT - eh - 30)
      });
      return;
    }

    setAttributePositions((prev) =>
      prev.map((item, idx) =>
        idx === dragTarget.index
          ? {
              x: clamp(p.x, 40, SVG_WIDTH - 40),
              y: clamp(p.y, 40, SVG_HEIGHT - 40)
            }
          : item
      )
    );
  };

  const stopDrag = () => {
    setDragTarget(null);
    pendingDragRef.current = null;
  };

  const handleEditSelected = () => {
    if (!selected) return;
    if (selected.type === 'entity') {
      openTextEdit('entity');
      return;
    }
    openTextEdit('attr', selected.index);
  };

  const ew = entityBox.w;
  const eh = entityBox.h;

  const langHint = labelLanguage === 'zh' ? '展示语言：中文（id 保持英文）' : 'Labels: English (id stays as id)';

  return (
    <>
      <ConfirmModal
        show={closeConfirmOpen}
        title="关闭 ER 图"
        message="确定要关闭 ER 图画布吗？未保存的编辑将丢失。"
        type="warning"
        overlayZClass="z-[350]"
        onConfirm={() => onClose()}
        onCancel={() => setCloseConfirmOpen(false)}
      />
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center p-5">
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
            className="relative z-10 bg-white border border-slate-200 rounded-3xl shadow-2xl w-[92vw] max-w-[1180px] h-[86vh] flex flex-col overflow-hidden"
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
                  aria-labelledby="er-text-edit-title"
                >
                  <h4 id="er-text-edit-title" className="text-sm font-bold text-slate-900 mb-3">
                    {textEdit.kind === 'entity' ? '编辑实体名称' : '编辑属性名称'}
                  </h4>
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
                <h3 className="text-lg font-bold text-slate-900">ER 图 - {tableName}</h3>
                <p className="text-xs text-slate-500">
                  双击实体或属性可编辑文字；{langHint}
                </p>
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
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-50 overflow-auto">
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-500">
                  <Loader2 size={22} className="animate-spin text-blue-600" />
                  <span className="text-sm">AI 正在解析当前表结构并生成 ER 图...</span>
                </div>
              ) : (
                <svg
                  ref={svgRef}
                  width={SVG_WIDTH}
                  height={SVG_HEIGHT}
                  className="mx-auto my-6 block select-none"
                  onMouseMove={handleMouseMove}
                  onMouseUp={stopDrag}
                  onMouseLeave={stopDrag}
                >
                  <rect
                    x={entityPos.x}
                    y={entityPos.y}
                    width={ew}
                    height={eh}
                    rx={10}
                    fill="none"
                    stroke={selected?.type === 'entity' ? '#2563eb' : '#334155'}
                    strokeWidth={2}
                    className="cursor-move"
                    onMouseDown={beginEntityPointerDown}
                  />
                  <text
                    x={entityPos.x + ew / 2}
                    y={entityPos.y + eh / 2 + 5}
                    textAnchor="middle"
                    className="fill-slate-800 cursor-move"
                    style={{ pointerEvents: 'auto' }}
                    fontSize="16"
                    fontWeight="700"
                    onMouseDown={beginEntityPointerDown}
                  >
                    {entityLabel}
                  </text>

                  {editableAttributes.map((attr, i) => {
                    const pos = attributePositions[i];
                    if (!pos) return null;
                    const anchor = getEntityAnchor(pos, ew, eh);
                    const label = attr.name;
                    const rx = Math.min(120, Math.max(58, 20 + label.length * 3.4));
                    return (
                      <g key={attr.id}>
                        <line
                          x1={anchor.x}
                          y1={anchor.y}
                          x2={pos.x}
                          y2={pos.y}
                          stroke="#94a3b8"
                          strokeWidth={1.5}
                        />
                        <ellipse
                          cx={pos.x}
                          cy={pos.y}
                          rx={rx}
                          ry={ATTR_RY}
                          fill="#fff"
                          stroke={selected?.type === 'attr' && selected.index === i ? '#2563eb' : '#334155'}
                          strokeWidth={1.6}
                          className="cursor-move"
                          onMouseDown={(e) => beginAttrPointerDown(i, e)}
                        />
                        <text
                          x={pos.x}
                          y={pos.y + 4}
                          textAnchor="middle"
                          className="fill-slate-700 cursor-move"
                          style={{ pointerEvents: 'auto' }}
                          fontSize="12"
                          fontWeight="600"
                          onMouseDown={(e) => beginAttrPointerDown(i, e)}
                        >
                          {label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-100 bg-white">
              <details>
                <summary className="text-xs font-semibold text-slate-500 cursor-pointer">查看用于 AI 解析的表语句</summary>
                <pre className="mt-2 max-h-32 overflow-auto text-[11px] leading-5 text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  {sourceSql}
                </pre>
              </details>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </>
  );
};

export default ERDiagramModal;
