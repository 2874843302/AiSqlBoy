import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2, Database, Table2, Terminal, AlertTriangle, ShieldCheck, ShieldAlert, Copy, Check, Crosshair } from 'lucide-react';
import type { AgentAction, SqlCategory } from '../../../shared/agentTypes';

// 复用主进程的安全分类信息（这里内联一份对应关系，避免跨进程导入）
const CATEGORY_INFO: Record<SqlCategory, { label: string; color: string; bg: string }> = {
  SELECT: { label: '查询 (只读)', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  INSERT: { label: '插入数据', color: 'text-blue-600', bg: 'bg-blue-50' },
  UPDATE: { label: '更新数据', color: 'text-amber-600', bg: 'bg-amber-50' },
  DELETE: { label: '删除数据', color: 'text-orange-600', bg: 'bg-orange-50' },
  DDL: { label: '结构变更 (DDL)', color: 'text-red-600', bg: 'bg-red-50' },
  DANGEROUS: { label: '危险操作', color: 'text-red-700', bg: 'bg-red-100' },
};

const TOOL_ICONS: Record<string, React.ElementType> = {
  list_tables: Table2,
  get_schema: Database,
  execute_sql: Terminal,
  finish: CheckCircle2,
};

const TOOL_LABELS: Record<string, string> = {
  list_tables: '列出表',
  get_schema: '获取表结构',
  execute_sql: '执行 SQL',
  finish: '任务完成',
};

type ActionCardProps = {
  action: AgentAction;
  onApprove?: (actionId: string) => void;
  onReject?: (actionId: string) => void;
  /** 成功的 SQL 动作：在右侧数据面板定位查询结果 */
  onLocate?: (action: AgentAction) => void;
};

const ActionCard: React.FC<ActionCardProps> = ({ action, onApprove, onReject, onLocate }) => {
  const Icon = TOOL_ICONS[action.tool] || Terminal;
  const toolLabel = TOOL_LABELS[action.tool] || action.tool;
  const categoryInfo = action.category ? CATEGORY_INFO[action.category] : null;

  const statusBadge = () => {
    switch (action.status) {
      case 'pending':
        return null;
      case 'auto-executed':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            <ShieldCheck size={10} /> 自动执行
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            已批准
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            <XCircle size={10} /> 已拒绝
          </span>
        );
      case 'executing':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
            <Loader2 size={10} className="animate-spin" /> 执行中...
          </span>
        );
      case 'done':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            <CheckCircle2 size={10} /> 执行完成
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
            <AlertTriangle size={10} /> 执行失败
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`border rounded-xl overflow-hidden ${
        action.status === 'pending'
          ? 'border-amber-200 bg-amber-50/30'
          : action.status === 'error' || action.status === 'rejected'
            ? 'border-red-200/60 bg-red-50/20'
            : 'border-slate-200 bg-slate-50/50'
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100/60">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
            action.status === 'pending' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'
          }`}>
            <Icon size={12} />
          </div>
          <span className="text-xs font-bold text-slate-700">{toolLabel}</span>
          {categoryInfo && (
            <span className={`text-[10px] font-bold ${categoryInfo.color} ${categoryInfo.bg} px-2 py-0.5 rounded-full`}>
              {categoryInfo.label}
            </span>
          )}
          {statusBadge()}
        </div>
        {action.status === 'pending' && (
          <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600">
            <ShieldAlert size={12} /> 需要审批
          </div>
        )}
        {action.tool === 'execute_sql' && action.result?.success && onLocate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLocate(action);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[10px] font-bold transition-colors"
            title="在右侧数据面板中定位该查询的数据"
          >
            <Crosshair size={11} /> 定位数据
          </button>
        )}
      </div>

      {/* Reason */}
      {action.reason && (
        <div className="px-4 py-2 text-xs text-slate-500 italic border-b border-slate-100/40">
          {action.reason}
        </div>
      )}

      {/* SQL preview */}
      {action.sql && (
        <div className="relative bg-slate-900/95 overflow-x-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(action.sql!);
              const btn = e.currentTarget;
              btn.querySelector('.copy-text')!.textContent = '已复制';
              setTimeout(() => { btn.querySelector('.copy-text')!.textContent = '复制'; }, 2000);
            }}
            className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] font-medium transition-colors"
            title="复制 SQL"
          >
            <Copy size={10} />
            <span className="copy-text">复制</span>
          </button>
          <pre className="px-4 py-3 text-[11px] text-slate-300 font-mono whitespace-pre-wrap break-all">
            {action.sql}
          </pre>
        </div>
      )}

      {/* Tables (for get_schema) */}
      {action.tool === 'get_schema' && action.tables && action.tables.length > 0 && (
        <div className="px-4 py-2 text-xs text-slate-500">
          目标表: {action.tables.join(', ')}
        </div>
      )}

      {/* Execution result */}
      {action.result && (
        <div className="px-4 py-2 border-t border-slate-100/40">
          {action.result.success ? (
            <div className="text-xs text-slate-500">
              {action.result.data && action.result.columns ? (
                <>
                  返回 {action.result.data.length} 行数据
                  {action.result.truncated && (
                    <span className="text-amber-500 ml-1">（已截断）</span>
                  )}
                  {action.result.executionTime && (
                    <span className="text-slate-400 ml-2">耗时 {action.result.executionTime}ms</span>
                  )}
                </>
              ) : action.result.affectedRows !== undefined ? (
                <>
                  影响 {action.result.affectedRows} 行
                  {action.result.executionTime && (
                    <span className="text-slate-400 ml-2">耗时 {action.result.executionTime}ms</span>
                  )}
                </>
              ) : (
                '执行成功'
              )}
            </div>
          ) : (
            <div className="text-xs text-red-500 flex items-start gap-1">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>{action.result.error}</span>
            </div>
          )}
        </div>
      )}

      {/* 影响面预览（UPDATE/DELETE 审批前） */}
      {action.impactPreview && (action.impactPreview.affectedRows !== null || action.impactPreview.error) && (
        <div className="px-4 py-2 border-t border-amber-100/40 bg-amber-50/40 flex items-center gap-1.5">
          {action.impactPreview.affectedRows !== null ? (
            <>
              <AlertTriangle size={12} className="text-amber-500 shrink-0" />
              <span className="text-xs text-amber-700">
                预计影响 <b className="font-bold">{action.impactPreview.affectedRows}</b> 行数据，请确认后执行
              </span>
            </>
          ) : (
            <span className="text-[11px] text-slate-400">影响面预览失败：{action.impactPreview.error}</span>
          )}
        </div>
      )}

      {/* Approval buttons */}
      <AnimatePresence>
        {action.status === 'pending' && onApprove && onReject && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-3 flex gap-2 border-t border-amber-100/60 bg-white/50"
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onApprove(action.id)}
              className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 size={14} /> 批准执行
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onReject(action.id)}
              className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
            >
              <XCircle size={14} /> 拒绝
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ActionCard;
