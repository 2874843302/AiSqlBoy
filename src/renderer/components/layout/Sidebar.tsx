import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Table, Bot, Plus, Settings, Trash2, Loader2, ChevronRight, Layout, RefreshCw, Filter, Server, Key, Star, Import } from 'lucide-react';
import type { ConnectionConfig } from '../../../shared/types';

type SidebarProps = {
  sidebarWidth: number;
  onStartResize: () => void;
  onOpenAgent: () => void;
  onAddConnection: () => void;
  onImportPackage: () => void;
  savedConnections: ConnectionConfig[];
  activeConnection: ConnectionConfig | null;
  connectingConnectionId: number | null;
  expandedConnections: Set<number>;
  expandedDatabases: Set<string>;
  databases: string[];
  filteredDatabases: string[];
  tables: { name: string }[];
  pinnedTables: Set<string>;
  selectedDatabase: string | null;
  selectedTable: string | null;
  onConnect: (conn: ConnectionConfig) => void;
  onEditConnection: (conn: ConnectionConfig, e: React.MouseEvent) => void;
  onDeleteConnection: (id: number, e: React.MouseEvent) => void;
  onRefreshDatabases: () => void;
  onOpenSchemaFilter: () => void;
  onSelectDatabase: (db: string) => void;
  onDatabaseContextMenu: (db: string, x: number, y: number) => void;
  onSelectTable: (name: string) => void;
  onTableContextMenu: (name: string, x: number, y: number) => void;
  onOpenSettings: () => void;
};

/** 只读连接包剩余有效期文案：按天/小时/分钟自动降档 */
const formatExpiryRemaining = (expiresAt: number): string => {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return '已过期';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `剩 ${Math.max(minutes, 1)} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `剩 ${hours} 小时`;
  return `剩 ${Math.floor(hours / 24)} 天`;
};

const Sidebar: React.FC<SidebarProps> = ({
  sidebarWidth,
  onStartResize,
  onOpenAgent,
  onAddConnection,
  onImportPackage,
  savedConnections,
  activeConnection,
  connectingConnectionId,
  expandedConnections,
  expandedDatabases,
  databases,
  filteredDatabases,
  tables,
  pinnedTables,
  selectedDatabase,
  selectedTable,
  onConnect,
  onEditConnection,
  onDeleteConnection,
  onRefreshDatabases,
  onOpenSchemaFilter,
  onSelectDatabase,
  onDatabaseContextMenu,
  onSelectTable,
  onTableContextMenu,
  onOpenSettings
}) => {
  return (
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        style={{ width: sidebarWidth }}
        className="bg-white border-r border-slate-200 flex flex-col z-20 shadow-xl relative shrink-0"
      >
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/40 z-30 transition-colors"
          onMouseDown={onStartResize}
        />
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-b from-slate-50 to-transparent overflow-hidden">
          <div className="flex items-center gap-3 truncate">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20 shrink-0">
              <Database size={18} className="text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900 truncate">AiSqlBoy</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onOpenAgent}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-colors border bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-600"
              title="Agent 模式"
            >
              <Bot size={16} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onImportPackage}
              className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full transition-colors border border-slate-200 text-slate-600"
              title="导入只读连接包"
            >
              <Import size={16} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onAddConnection}
              className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full transition-colors border border-slate-200 text-slate-600"
              title="添加连接"
            >
              <Plus size={16} />
            </motion.button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Saved Connections */}
          <div className="p-4 space-y-4">
            <div className="px-2">
              <div className="text-[10px] font-bold text-slate-400 tracking-wide mb-3">我的连接</div>
              <div className="space-y-1">
                <AnimatePresence>
                  {savedConnections.map((conn) => (
                    <div key={conn.id} className="space-y-1">
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={() => onConnect(conn)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onConnect(conn);
                          }
                        }}
                        className={`group flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden ${
                          activeConnection?.id === conn.id 
                          ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm' 
                          : 'hover:bg-slate-50 text-slate-600 border border-transparent'
                        } ${connectingConnectionId !== null ? 'cursor-not-allowed opacity-85' : 'cursor-pointer'}`}
                      >
                        <div className="flex items-center gap-3 overflow-hidden z-10">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              activeConnection?.id === conn.id
                                ? 'bg-emerald-500'
                                : conn.type === 'mysql'
                                  ? 'bg-orange-500'
                                  : conn.type === 'postgresql'
                                    ? 'bg-blue-500'
                                    : conn.type === 'oracle'
                                      ? 'bg-red-600'
                                      : conn.type === 'redis'
                                        ? 'bg-red-500'
                                        : 'bg-slate-400'
                            }`}
                            title={activeConnection?.id === conn.id ? '已连接' : '未连接'}
                          />
                          <span className="truncate font-semibold">{conn.name}</span>
                          {conn.readOnly && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200" title="只读连接：仅允许查询">
                              只读
                            </span>
                          )}
                          {conn.expiresAt != null && (() => {
                            const expired = Date.now() > conn.expiresAt;
                            const soon = !expired && conn.expiresAt! - Date.now() < 24 * 60 * 60 * 1000;
                            return (
                              <span
                                className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                  expired
                                    ? 'bg-red-50 text-red-500 border-red-200'
                                    : soon
                                      ? 'bg-orange-50 text-orange-600 border-orange-200'
                                      : 'bg-blue-50 text-blue-600 border-blue-200'
                                }`}
                                title={
                                  expired
                                    ? `该只读连接已于 ${new Date(conn.expiresAt!).toLocaleString('zh-CN')} 过期，请联系分享者重新导出`
                                    : `有效期至 ${new Date(conn.expiresAt!).toLocaleString('zh-CN')}`
                                }
                              >
                                {formatExpiryRemaining(conn.expiresAt!)}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-1 z-10">
                          {!conn.locked && (
                          <motion.button
                            whileHover={{ scale: 1.1, color: '#2563eb' }}
                            onClick={(e) => onEditConnection(conn, e)}
                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1.5 hover:bg-blue-50 rounded-lg transition-all text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="修改配置"
                            disabled={connectingConnectionId !== null}
                          >
                            <Settings size={14} />
                          </motion.button>
                          )}
                          <motion.button
                            whileHover={{ scale: 1.1, color: '#ef4444' }}
                            onClick={(e) => onDeleteConnection(conn.id!, e)}
                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1.5 hover:bg-red-50 rounded-lg transition-all text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="删除连接"
                            disabled={connectingConnectionId !== null}
                          >
                            <Trash2 size={14} />
                          </motion.button>
                          {connectingConnectionId === conn.id ? (
                            <Loader2 size={14} className="animate-spin text-blue-500" />
                          ) : (
                            <ChevronRight size={14} className={`transition-transform duration-300 ${expandedConnections.has(conn.id!) ? 'rotate-90 opacity-100 text-blue-400' : 'opacity-0 group-hover:opacity-40'}`} />
                          )}
                        </div>
                      </motion.div>

                      {/* Connection Expansion (Databases) */}
                      <AnimatePresence>
                        {expandedConnections.has(conn.id!) && activeConnection?.id === conn.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="ml-4 pl-2 border-l border-slate-100 space-y-4 py-2 overflow-hidden"
                          >
                            {/* Database List */}
                            <div className="px-2">
                              <div className="text-[10px] font-bold text-slate-400 tracking-wide mb-3 flex items-center gap-2">
                                <Layout size={16} /> 数据库
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void onRefreshDatabases();
                                  }}
                                  className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold normal-case tracking-normal bg-slate-100 text-slate-600 hover:bg-slate-200"
                                  title="刷新当前连接数据库列表"
                                >
                                  <RefreshCw size={12} />
                                  刷新
                                </button>
                                {activeConnection?.type !== 'sqlite' && activeConnection?.type !== 'redis' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenSchemaFilter();
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold normal-case tracking-normal bg-slate-100 text-slate-600 hover:bg-slate-200"
                                    title="筛选要展示的数据库架构"
                                  >
                                    <Filter size={12} />
                                    架构筛选
                                  </button>
                                )}
                              </div>
                              {databases.length > filteredDatabases.length && (
                                <div className="text-[10px] text-slate-400 mb-2">
                                  已隐藏 {databases.length - filteredDatabases.length} 个未选架构
                                </div>
                              )}
                              <div className="grid grid-cols-1 gap-1">
                                {filteredDatabases.map((db) => (
                                  <div key={db} className="space-y-1">
                                    <motion.button
                                      onClick={() => onSelectDatabase(db)}
                                      onContextMenu={(e) => {
                                        e.preventDefault();
                                        onDatabaseContextMenu(db, e.clientX, e.clientY);
                                      }}
                                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left transition-all duration-200 ${
                                        selectedDatabase === db 
                                        ? 'bg-blue-50 text-blue-600 border border-blue-100' 
                                        : 'hover:bg-slate-50 text-slate-500 border border-transparent hover:text-slate-700'
                                      }`}
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        {activeConnection?.type === 'redis' ? (
                                          <Server size={16} className={`flex-shrink-0 ${selectedDatabase === db ? 'text-blue-500' : 'text-slate-400'}`} />
                                        ) : (
                                          <Database size={16} className={`flex-shrink-0 ${selectedDatabase === db ? 'text-blue-500' : 'text-slate-400'}`} />
                                        )}
                                        <span className="truncate font-semibold">{activeConnection?.type === 'redis' ? `DB ${db}` : db}</span>
                                      </div>
                                      <ChevronRight size={14} className={`transition-transform duration-300 ${expandedDatabases.has(db) ? 'rotate-90' : ''} ${selectedDatabase === db ? 'opacity-100' : 'opacity-0'}`} />
                                    </motion.button>

                                    {/* Database Expansion (Tables) */}
                                    <AnimatePresence>
                                      {expandedDatabases.has(db) && selectedDatabase === db && (
                                        <motion.div
                                          initial={{ height: 0, opacity: 0 }}
                                          animate={{ height: 'auto', opacity: 1 }}
                                          exit={{ height: 0, opacity: 0 }}
                                          transition={{ duration: 0.2, ease: "easeInOut" }}
                                          className="ml-4 pl-2 border-l border-slate-100 py-1 space-y-1 overflow-hidden"
                                        >
                                          {[...tables].sort((a, b) => {
                                            // 置顶表排在前，其余按字母序
                                            const aPinned = pinnedTables.has(a.name) ? 0 : 1;
                                            const bPinned = pinnedTables.has(b.name) ? 0 : 1;
                                            if (aPinned !== bPinned) return aPinned - bPinned;
                                            return a.name.localeCompare(b.name);
                                          }).map((table) => {
                                            const isPinned = pinnedTables.has(table.name);
                                            return (
                                            <motion.button
                                              key={table.name}
                                              onClick={() => onSelectTable(table.name)}
                                              onContextMenu={(e) => {
                                                e.preventDefault();
                                                onTableContextMenu(table.name, e.clientX, e.clientY);
                                              }}
                                              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-all duration-200 ${
                                                selectedTable === table.name 
                                                ? 'bg-blue-600 text-white shadow-md' 
                                                : isPinned
                                                  ? 'text-slate-600 border border-slate-200/60'
                                                  : 'hover:bg-slate-50 text-slate-500 hover:text-slate-700'
                                              }`}
                                            >
                                              {activeConnection?.type === 'redis' ? (
                                                <Key size={16} className={`flex-shrink-0 ${selectedTable === table.name ? 'text-blue-100' : 'text-slate-400'}`} />
                                              ) : (
                                                <Table size={16} className={`flex-shrink-0 ${selectedTable === table.name ? 'text-blue-100' : 'text-slate-400'}`} />
                                              )}
                                              <span className={`truncate font-semibold ${isPinned ? 'text-inherit' : ''}`}>{table.name}</span>
                                              {isPinned && (
                                                <Star size={12} className={`flex-shrink-0 ml-auto ${selectedTable === table.name ? 'text-blue-200' : 'text-amber-400'}`} fill="currentColor" />
                                              )}
                                            </motion.button>
                                            );
                                          })}
                                          {tables.length === 0 && (
                                            <div className="px-3 py-2 text-[10px] text-slate-400 italic">
                                              {activeConnection?.type === 'redis' ? '暂无 Key' : '暂无数据表'}
                                            </div>
                                          )}
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                ))}
                                {filteredDatabases.length === 0 && (
                                  <div className="px-3 py-2 text-[10px] text-slate-400 italic">暂无数据库</div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </AnimatePresence>
                {savedConnections.length === 0 && (
                  <div className="text-xs text-slate-400 italic p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    点击上方 + 号添加连接
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <motion.div
            whileHover={{ backgroundColor: '#f1f5f9' }}
            onClick={onOpenSettings}
            className="flex items-center gap-3 px-4 py-3 text-slate-600 transition-all cursor-pointer rounded-2xl hover:shadow-sm group"
          >
            <Settings size={16} className="group-hover:rotate-45 transition-transform duration-500" />
            <span className="text-sm font-bold">系统设置</span>
          </motion.div>
        </div>
      </motion.div>
  );
};

export default Sidebar;
