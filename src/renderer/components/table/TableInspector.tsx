import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, X, Loader2 } from 'lucide-react';
import { highlightSqlForDisplay } from '../../utils/sqlText';

type TableInspectorPanelProps = {
  tableInspector: {
    open: boolean;
    loading: boolean;
    tableName: string;
    ddl: string;
    rowCount: number | null;
    columnCount: number;
    indexCount: number;
    error: string;
  };
  tableInspectorWidth: number;
  fallbackTableName: string | null;
  onStartResize: () => void;
  onClose: () => void;
  onCopySql: () => void;
  onRefresh: () => void;
};

const TableInspectorPanel: React.FC<TableInspectorPanelProps> = ({
  tableInspector,
  tableInspectorWidth,
  fallbackTableName,
  onStartResize,
  onClose,
  onCopySql,
  onRefresh
}) => {
  return (
                  <motion.aside
                    initial={{ x: 24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 24, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="absolute top-8 right-8 bottom-8 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 overflow-hidden flex flex-col"
                    style={{ width: tableInspectorWidth }}
                  >
                    <div
                      className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/40 z-30 transition-colors"
                      onMouseDown={onStartResize}
                      title="拖拽调整宽度"
                    />
                    <button
                      onClick={onClose}
                      className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 w-8 h-16 rounded-l-xl border border-r-0 border-slate-200 bg-white/95 hover:bg-white text-slate-400 hover:text-blue-600 shadow-md transition-all flex items-center justify-center"
                      title="收起表信息"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-slate-800">表信息</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">{tableInspector.tableName || fallbackTableName}</div>
                      </div>
                      <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg hover:bg-slate-200/70 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
                        title="关闭"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="p-4 border-b border-slate-100 grid grid-cols-3 gap-2 text-center">
                      <div className="bg-slate-50 rounded-xl py-2 px-1">
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Rows</div>
                        <div className="text-sm font-bold text-slate-700">{tableInspector.rowCount ?? '-'}</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl py-2 px-1">
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Columns</div>
                        <div className="text-sm font-bold text-slate-700">{tableInspector.columnCount}</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl py-2 px-1">
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Indexes</div>
                        <div className="text-sm font-bold text-slate-700">{tableInspector.indexCount}</div>
                      </div>
                    </div>

                    <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Create SQL</span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={onCopySql}
                          className="text-xs font-bold text-slate-500 hover:text-slate-700"
                        >
                          复制
                        </button>
                        <button
                          onClick={onRefresh}
                          className="text-xs font-bold text-blue-600 hover:text-blue-700"
                        >
                          刷新
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 px-4 pb-4 overflow-auto custom-scrollbar">
                      {tableInspector.loading ? (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                          <Loader2 size={16} className="animate-spin mr-2" />
                          读取中...
                        </div>
                      ) : tableInspector.error ? (
                        <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl p-3">{tableInspector.error}</div>
                      ) : (
                        <pre className="text-[12px] leading-5 text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono max-w-full overflow-hidden whitespace-pre-wrap break-words">
                          <code
                            className="language-sql block max-w-full whitespace-pre-wrap break-words"
                            style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                            dangerouslySetInnerHTML={{
                              __html: highlightSqlForDisplay(tableInspector.ddl || '-- 暂无建表语句 --')
                            }}
                          />
                        </pre>
                      )}
                    </div>
                  </motion.aside>
  );
};

export default TableInspectorPanel;
