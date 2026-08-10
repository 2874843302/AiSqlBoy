import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Loader2, Send, X, Shield, ShieldCheck, ShieldAlert, Eraser,
  AlertTriangle, ArrowLeft, ChevronDown, Database, Table2,
  Plus, Trash2, Pencil, MessageSquare, Check, ChevronRight, Link2
} from 'lucide-react';
import type {
  AgentMessage,
  AgentPermissionLevel,
} from '../../../shared/agentTypes';
import type { AgentConversation } from '../../hooks/useAgent';
import type { ConnectionConfig } from '../../../shared/types';
import AgentMessageItem from './AgentMessageItem';

type AgentPanelProps = {
  show: boolean;
  onClose: () => void;
  messages: AgentMessage[];
  loading: boolean;
  input: string;
  setInput: (v: string) => void;
  onSubmit: () => void;
  permissionLevel: AgentPermissionLevel;
  onPermissionChange: (level: AgentPermissionLevel) => void;
  onApproveAction: (actionId: string) => void;
  onRejectAction: (actionId: string) => void;
  onClearSession: () => void;
  errorMessage?: string | null;
  iteration?: number;
  databases: string[];
  selectedDatabase: string | null;
  onSelectDatabase: (db: string) => void;
  tables: { name: string }[];
  selectedTable: string | null;
  onSelectTable: (table: string | null) => void;
  /* 会话管理 */
  savedConnections: ConnectionConfig[];
  conversationsByConn: Record<number, AgentConversation[]>;
  currentConversationId: string | null;
  currentConvConnectionId: number | null;
  onNewConversation: (connectionId: number) => void;
  onSelectConversation: (convId: string) => void;
  onDeleteConversation: (convId: string) => void;
  onRenameConversation: (convId: string, title: string) => void;
  onConnect: (config: ConnectionConfig) => void;
  /* 活跃连接信息 */
  activeConnectionId?: number;
  activeConnectionName?: string;
};

const PERMISSION_OPTIONS: {
  value: AgentPermissionLevel;
  label: string;
  icon: React.ElementType;
  color: string;
  desc: string;
}[] = [
  { value: 'readonly', label: '只读', icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-50 border-emerald-200', desc: '仅允许 SELECT 查询' },
  { value: 'write-confirm', label: '写操作需确认', icon: Shield, color: 'text-amber-600 bg-amber-50 border-amber-200', desc: 'SELECT 自动执行，写操作需审批' },
  { value: 'full-control', label: '完全控制', icon: ShieldAlert, color: 'text-red-600 bg-red-50 border-red-200', desc: '含 DDL，危险操作仍会被拒绝' },
];

const AgentPanel: React.FC<AgentPanelProps> = ({
  show, onClose, messages, loading, input, setInput, onSubmit,
  permissionLevel, onPermissionChange, onApproveAction, onRejectAction,
  onClearSession, errorMessage, iteration = 0,
  databases, selectedDatabase, onSelectDatabase, tables, selectedTable, onSelectTable,
  savedConnections, conversationsByConn, currentConversationId, currentConvConnectionId,
  onNewConversation, onSelectConversation, onDeleteConversation, onRenameConversation, onConnect,
  activeConnectionId, activeConnectionName,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showPermissionMenu, setShowPermissionMenu] = useState(false);
  const [showDbMenu, setShowDbMenu] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [expandedConns, setExpandedConns] = useState<Set<number>>(new Set());

  const mergedMessages = useMemo(() => {
    const resultMap = new Map<string, AgentMessage>();
    for (const msg of messages) {
      if (msg.role === 'tool_result') resultMap.set(msg.actionId, msg);
    }
    const result: AgentMessage[] = [];
    for (const msg of messages) {
      if (msg.role === 'tool_result') continue;
      if (msg.role === 'assistant' && msg.actions && msg.actions.length > 0 && resultMap.size > 0) {
        const updatedActions = msg.actions.map((action) => {
          const toolResult = resultMap.get(action.id);
          if (toolResult && toolResult.role === 'tool_result') {
            if (action.status === 'rejected') return { ...action, result: toolResult.result };
            if (action.status === 'approved') return { ...action, result: toolResult.result, status: toolResult.result.success ? ('done' as const) : ('error' as const) };
            if (action.status === 'done' || action.status === 'error') return { ...action, result: toolResult.result };
            return { ...action, result: toolResult.result, status: toolResult.result.success ? ('done' as const) : ('error' as const) };
          }
          return action;
        });
        result.push({ ...msg, actions: updatedActions });
      } else {
        result.push(msg);
      }
    }
    return result;
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [mergedMessages, loading]);

  // 自动展开当前会话所属的连接
  useEffect(() => {
    if (currentConvConnectionId && !expandedConns.has(currentConvConnectionId)) {
      setExpandedConns((prev) => new Set([...prev, currentConvConnectionId!]));
    }
  }, [currentConvConnectionId]);

  const filteredTables = useMemo(() => {
    if (!tableSearch.trim()) return tables;
    return tables.filter(t => t.name.toLowerCase().includes(tableSearch.toLowerCase()));
  }, [tables, tableSearch]);

  const currentPerm = PERMISSION_OPTIONS.find(p => p.value === permissionLevel);
  const PermIcon = currentPerm?.icon || Shield;

  const toggleConn = (connId: number) => {
    setExpandedConns((prev) => {
      const next = new Set(prev);
      if (next.has(connId)) next.delete(connId);
      else next.add(connId);
      return next;
    });
  };

  const handleRenameSubmit = (convId: string) => {
    if (editingTitle.trim()) onRenameConversation(convId, editingTitle.trim());
    setEditingConvId(null); setEditingTitle('');
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] bg-white flex"
        >
          {/* ============ 左侧边栏 ============ */}
          <div className="w-72 border-r border-slate-200 flex flex-col bg-slate-50/50">
            {/* Header */}
            <div className="px-4 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md shadow-indigo-600/20">
                  <Bot size={16} className="text-white" />
                </div>
                <h3 className="font-bold text-sm text-slate-900">Agent 模式</h3>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center bg-white hover:bg-slate-100 rounded-lg text-slate-400 transition-colors border border-slate-200"
                title="退出 Agent 模式"
              >
                <ArrowLeft size={16} />
              </motion.button>
            </div>

            {/* 连接 + 会话列表 */}
            <div className="flex-1 overflow-y-auto py-2">
              {savedConnections.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-300 gap-2">
                  <Link2 size={32} />
                  <p className="text-[11px]">暂无数据库连接</p>
                </div>
              ) : (
                savedConnections.map((conn) => {
                  if (!conn.id) return null;
                  const isExpanded = expandedConns.has(conn.id);
                  const convs = conversationsByConn[conn.id] || [];
                  const isActive = activeConnectionId === conn.id;
                  const hasCurrentConv = currentConvConnectionId === conn.id;

                  return (
                    <div key={conn.id} className="mb-0.5">
                      {/* 连接行 */}
                      <div
                        onClick={() => { onConnect(conn); toggleConn(conn.id!); }}
                        className={`group flex items-center gap-2 px-2.5 py-2 cursor-pointer transition-colors ${
                          hasCurrentConv ? 'bg-indigo-50/50' : 'hover:bg-slate-100'
                        }`}
                      >
                        <ChevronRight
                          size={12}
                          className={`shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        />
                        <Database size={13} className={`shrink-0 ${isActive ? 'text-indigo-500' : 'text-slate-400'}`} />
                        <span className={`flex-1 min-w-0 truncate text-xs font-medium ${isActive ? 'text-indigo-600' : 'text-slate-600'}`}>
                          {conn.name}
                        </span>
                        <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full shrink-0">
                          {conn.type}
                        </span>
                        {/* 新建会话按钮 */}
                        <button
                          onClick={(e) => { e.stopPropagation(); onNewConversation(conn.id!); }}
                          className="w-5 h-5 flex items-center justify-center hover:bg-indigo-100 hover:text-indigo-600 rounded text-slate-400 transition-colors shrink-0"
                          title="在此连接下新建会话"
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      {/* 会话列表（展开时） */}
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            {convs.length === 0 ? (
                              <div className="pl-10 pr-3 py-1.5 text-[10px] text-slate-300">暂无会话</div>
                            ) : (
                              convs.map((conv) => (
                                <div
                                  key={conv.id}
                                  onClick={() => editingConvId !== conv.id && onSelectConversation(conv.id)}
                                  className={`group flex items-center gap-2 pl-10 pr-2.5 py-1.5 cursor-pointer transition-colors ${
                                    currentConversationId === conv.id
                                      ? 'bg-indigo-50 text-indigo-600'
                                      : 'hover:bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  <MessageSquare size={11} className="shrink-0" />
                                  {editingConvId === conv.id ? (
                                    <input
                                      type="text"
                                      value={editingTitle}
                                      onChange={(e) => setEditingTitle(e.target.value)}
                                      onBlur={() => handleRenameSubmit(conv.id)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleRenameSubmit(conv.id);
                                        if (e.key === 'Escape') { setEditingConvId(null); setEditingTitle(''); }
                                      }}
                                      autoFocus
                                      className="flex-1 min-w-0 bg-white border border-indigo-300 rounded px-1.5 py-0.5 text-[11px] outline-none"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  ) : (
                                    <span className="flex-1 min-w-0 truncate text-[11px] font-medium">{conv.title}</span>
                                  )}
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditingConvId(conv.id); setEditingTitle(conv.title); }}
                                      className="w-4 h-4 flex items-center justify-center hover:bg-slate-200 rounded text-slate-400"
                                      title="重命名"
                                    >
                                      <Pencil size={9} />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id); }}
                                      className="w-4 h-4 flex items-center justify-center hover:bg-red-100 hover:text-red-500 rounded text-slate-400"
                                      title="删除"
                                    >
                                      <Trash2 size={9} />
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
            </div>

            {/* 底部权限选择器 */}
            <div className="px-3 py-2 border-t border-slate-200">
              <div className="relative">
                <button
                  onClick={() => setShowPermissionMenu(!showPermissionMenu)}
                  className={`w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${currentPerm?.color}`}
                >
                  <span className="flex items-center gap-1.5">
                    <PermIcon size={12} />
                    {currentPerm?.label}
                  </span>
                  <ChevronDown size={12} />
                </button>
                <AnimatePresence>
                  {showPermissionMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowPermissionMenu(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden"
                      >
                        {PERMISSION_OPTIONS.map((opt) => {
                          const Icon = opt.icon;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => { onPermissionChange(opt.value); setShowPermissionMenu(false); }}
                              className={`w-full px-3 py-2.5 flex items-start gap-2.5 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0 ${permissionLevel === opt.value ? 'bg-slate-50' : ''}`}
                            >
                              <Icon size={14} className={`shrink-0 mt-0.5 ${opt.color.split(' ')[0]}`} />
                              <div>
                                <div className="text-xs font-bold text-slate-700">{opt.label}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</div>
                              </div>
                              {permissionLevel === opt.value && <Check size={12} className="shrink-0 ml-auto text-indigo-500" />}
                            </button>
                          );
                        })}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* ============ 右侧对话区 ============ */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* 顶部工具栏 */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {activeConnectionName && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Database size={11} />
                    {activeConnectionName}
                  </span>
                )}
                <span className="text-xs text-slate-300">·</span>
                <span className="text-xs text-slate-400">
                  {iteration > 0 ? `已执行 ${iteration} 步` : 'AI 自主执行 SQL'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClearSession}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100 text-slate-400 text-[11px] transition-colors"
                  title="清空当前会话消息"
                >
                  <Eraser size={12} /> 清空
                </button>
                <button
                  onClick={onClose}
                  className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors"
                  title="关闭"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* 错误提示 */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="px-5 py-2.5 bg-red-50 border-b border-red-100 flex items-center gap-2"
                >
                  <AlertTriangle size={14} className="text-red-500 shrink-0" />
                  <span className="text-xs text-red-600 font-medium">{errorMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 消息区域 */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-8 bg-slate-50/30">
              <div className="max-w-3xl mx-auto space-y-6">
                {messages.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center py-32 text-slate-400 gap-3">
                    <Bot size={56} className="text-slate-200" />
                    <p className="text-sm text-center max-w-[320px] leading-relaxed">
                      从左侧选择或新建一个会话，然后告诉我你想做什么。
                    </p>
                    <span className="text-xs text-slate-300 mt-2">
                      当前权限: {currentPerm?.label} — {currentPerm?.desc}
                    </span>
                  </div>
                )}

                {mergedMessages.map((msg, i) => (
                  <div key={i} className={msg.role === 'user' ? 'flex justify-end' : ''}>
                    <AgentMessageItem message={msg} onApprove={onApproveAction} onReject={onRejectAction} />
                  </div>
                ))}

                {(() => { const lastMsg = mergedMessages[mergedMessages.length - 1]; return loading && !(mergedMessages.length > 0 && lastMsg?.role === 'assistant' && lastMsg.content); })() && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                      <Bot size={18} />
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin text-indigo-600" />
                      <span className="text-xs text-slate-500">Agent 思考中...</span>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {/* 输入区域 */}
            <div className="px-5 py-4 bg-white border-t border-slate-100">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative">
                    <button
                      onClick={() => { setShowDbMenu(!showDbMenu); setShowTableMenu(false); }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors max-w-[180px]"
                    >
                      <Database size={12} className="shrink-0 text-indigo-500" />
                      <span className="truncate">{selectedDatabase || '选择数据库'}</span>
                      <ChevronDown size={12} className="shrink-0 text-slate-400" />
                    </button>
                    <AnimatePresence>
                      {showDbMenu && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setShowDbMenu(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                            className="absolute left-0 bottom-full mb-1 w-[200px] bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden max-h-[240px] overflow-y-auto"
                          >
                            {databases.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-slate-400">无可用数据库</div>
                            ) : (
                              databases.map((db) => (
                                <button
                                  key={db}
                                  onClick={() => { onSelectDatabase(db); setShowDbMenu(false); }}
                                  className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 transition-colors text-left text-xs ${selectedDatabase === db ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-600'}`}
                                >
                                  <Database size={12} className="shrink-0" />
                                  <span className="truncate">{db}</span>
                                </button>
                              ))
                            )}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                  <span className="text-slate-300 text-xs">/</span>
                  <div className="relative flex-1">
                    <button
                      onClick={() => { setShowTableMenu(!showTableMenu); setShowDbMenu(false); }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors w-full max-w-[240px]"
                    >
                      <Table2 size={12} className="shrink-0 text-indigo-500" />
                      <span className="truncate">{selectedTable || '全部表'}</span>
                      <ChevronDown size={12} className="shrink-0 text-slate-400 ml-auto" />
                    </button>
                    <AnimatePresence>
                      {showTableMenu && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => { setShowTableMenu(false); setTableSearch(''); }} />
                          <motion.div
                            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                            className="absolute left-0 bottom-full mb-1 w-[260px] bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden"
                          >
                            <button
                              onClick={() => { onSelectTable(null); setShowTableMenu(false); setTableSearch(''); }}
                              className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 transition-colors text-left text-xs border-b border-slate-100 ${!selectedTable ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-600'}`}
                            >
                              <Table2 size={12} className="shrink-0" />
                              <span>全部表</span>
                            </button>
                            <div className="px-2 py-1.5 border-b border-slate-100">
                              <input
                                type="text" placeholder="搜索表名..."
                                value={tableSearch} onChange={(e) => setTableSearch(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-indigo-500/30"
                                autoFocus
                              />
                            </div>
                            <div className="max-h-[180px] overflow-y-auto">
                              {filteredTables.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-slate-400">无匹配的表</div>
                              ) : (
                                filteredTables.map((t) => (
                                  <button
                                    key={t.name}
                                    onClick={() => { onSelectTable(t.name); setShowTableMenu(false); setTableSearch(''); }}
                                    className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 transition-colors text-left text-xs ${selectedTable === t.name ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-600'}`}
                                  >
                                    <Table2 size={12} className="shrink-0" />
                                    <span className="truncate">{t.name}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                                <div className="flex gap-2 items-end">
                  <textarea
                    placeholder="输入你的需求... (Shift+Enter 换行)"
                    rows={1}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all resize-none min-h-[42px] max-h-[120px]"
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      // 自动调整高度
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        onSubmit();
                        // 重置高度
                        (e.target as HTMLTextAreaElement).style.height = 'auto';
                      }
                    }}
                    disabled={loading}
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={onSubmit} disabled={loading || !input.trim()}
                    className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 transition-all"
                  >
                    <Send size={18} />
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AgentPanel;
