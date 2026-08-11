import React from 'react';
import { motion } from 'framer-motion';
import { Table, Plus, X, ChevronRight, Trash2, Loader2, Sparkles, Server, Activity } from 'lucide-react';
import { DB_TYPES } from '../../constants/dbTypes';

export type SchemaData = { tableName: string; columns: any[]; indexes: any[] };

type SchemaEditorModalProps = {
  schemaData: SchemaData;
  onSchemaChange: (data: SchemaData) => void;
  activeSchemaTab: 'columns' | 'indexes';
  onTabChange: (tab: 'columns' | 'indexes') => void;
  schemaCommentAILoading: boolean;
  onGenerateAIComments: () => void;
  connectionType?: string;
  readOnly?: boolean; // 只读模式：仅查看结构，隐藏一切修改入口
  existingTables: string[];
  onClose: () => void;
  onSave: () => void;
};

const SchemaEditorModal: React.FC<SchemaEditorModalProps> = ({
  schemaData,
  onSchemaChange,
  activeSchemaTab,
  onTabChange,
  schemaCommentAILoading,
  onGenerateAIComments,
  connectionType,
  readOnly,
  existingTables,
  onClose,
  onSave
}) => {
  const isExistingTable = existingTables.includes(schemaData.tableName);
  return (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onClose()}
              className="absolute inset-0 bg-slate-900/20"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-[900px] max-h-[85vh] flex flex-col overflow-hidden z-10"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-slate-50 to-transparent">
                <div>
                  <h3 className="font-bold text-lg text-slate-900 tracking-tight">
                    {isExistingTable ? '修改表结构' : '创建新表'}
                  </h3>
                  <div className="text-xs text-slate-500 mt-1 font-semibold flex items-center gap-2">
                    <Table size={12} />
                    {isExistingTable ? (
                      <span>{schemaData.tableName}</span>
                    ) : (
                      <input
                        type="text"
                        placeholder="输入表名..."
                        value={schemaData.tableName === 'new_table' ? '' : schemaData.tableName}
                        onChange={(e) => onSchemaChange({ ...schemaData, tableName: e.target.value })}
                        className="bg-white border border-slate-200 rounded px-2 py-0.5 outline-none focus:border-blue-500 font-mono"
                      />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {readOnly && (
                    <span className="px-2 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-600 border border-amber-200">只读模式</span>
                  )}
                  {!readOnly && activeSchemaTab === 'columns' && (
                    <motion.button
                      whileHover={{ scale: schemaCommentAILoading ? 1 : 1.05 }}
                      whileTap={{ scale: schemaCommentAILoading ? 1 : 0.95 }}
                      onClick={onGenerateAIComments}
                      disabled={schemaCommentAILoading}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {schemaCommentAILoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      {schemaCommentAILoading ? 'AI 生成中...' : 'AI 一键注释'}
                    </motion.button>
                  )}
                  {!readOnly && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      if (activeSchemaTab === 'columns') {
                        const newCol = { id: Date.now(), name: 'new_column', type: 'VARCHAR(255)', nullable: true, primaryKey: false, autoIncrement: false, defaultValue: '', comment: '', originalName: null };
                        onSchemaChange({ ...schemaData, columns: [...schemaData.columns, newCol] });
                      } else {
                        const newIdx = { id: Date.now(), name: `idx_${schemaData.tableName}_${Date.now().toString().slice(-4)}`, columns: [], unique: false, originalName: null };
                        onSchemaChange({ ...schemaData, indexes: [...schemaData.indexes, newIdx] });
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors"
                  >
                    <Plus size={14} /> {activeSchemaTab === 'columns' ? '添加列' : '添加索引'}
                  </motion.button>
                  )}
                  <motion.button
                    whileHover={{ rotate: 90, scale: 1.1 }}
                    onClick={() => onClose()}
                    className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                  >
                    <X size={16} />
                  </motion.button>
                </div>
              </div>

              <div className="px-8 py-2 border-b border-slate-100 flex gap-6 bg-slate-50/30">
                <button
                  onClick={() => onTabChange('columns')}
                  className={`py-2 text-xs font-bold transition-all relative ${
                    activeSchemaTab === 'columns' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  字段设计
                  {activeSchemaTab === 'columns' && (
                    <motion.div layoutId="schemaTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                  )}
                </button>
                <button
                  onClick={() => onTabChange('indexes')}
                  className={`py-2 text-xs font-bold transition-all relative ${
                    activeSchemaTab === 'indexes' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  索引设计
                  {activeSchemaTab === 'indexes' && (
                    <motion.div layoutId="schemaTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                  )}
                </button>
              </div>

              <div className="flex-1 overflow-auto p-0">
                {activeSchemaTab === 'columns' ? (
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                      <tr>
                        <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">列名</th>
                        <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">类型</th>
                        <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-20">允许空</th>
                        <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-20">主键</th>
                        <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-20">自增</th>
                        <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">默认值</th>
                        <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">注释</th>
                        <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-16">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {schemaData.columns.map((col, idx) => (
                        <motion.tr
                          key={col.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="group hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-6 py-3">
                            <input
                              type="text"
                              value={col.name}
                              onChange={(e) => {
                                const newCols = [...schemaData.columns];
                                newCols[idx].name = e.target.value;
                                onSchemaChange({ ...schemaData, columns: newCols });
                              }}
                              className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm font-mono text-slate-700 font-semibold"
                            />
                          </td>
                          <td className="px-6 py-3 relative group/type">
                              <div className="flex items-center">
                                <input
                                  type="text"
                                  value={col.type}
                                  onChange={(e) => {
                                    const newCols = [...schemaData.columns];
                                    newCols[idx].type = e.target.value;
                                    onSchemaChange({ ...schemaData, columns: newCols });
                                  }}
                                  className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm text-blue-600 font-mono pr-6 relative z-10"
                                  placeholder="选择或输入类型..."
                                />
                                <div className="absolute right-4 pointer-events-none text-slate-300 group-hover/type:text-blue-400 transition-colors z-20">
                                  <ChevronRight size={12} className="rotate-90" />
                                </div>
                                <select
                                  value=""
                                  onChange={(e) => {
                                    const newCols = [...schemaData.columns];
                                    newCols[idx].type = e.target.value;
                                    onSchemaChange({ ...schemaData, columns: newCols });
                                  }}
                                  className="absolute inset-0 opacity-0 cursor-pointer w-full z-0"
                                >
                                  <option value="" disabled>选择常用类型...</option>
                                  {(
                                    connectionType === 'sqlite' ? DB_TYPES.sqlite :
                                    connectionType === 'postgresql' ? DB_TYPES.postgresql :
                                    connectionType === 'oracle' ? DB_TYPES.oracle :
                                    DB_TYPES.mysql
                                  ).map(type => (
                                    <option key={type} value={type}>{type}</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                          <td className="px-6 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={col.nullable}
                              onChange={(e) => {
                                const newCols = [...schemaData.columns];
                                newCols[idx].nullable = e.target.checked;
                                onSchemaChange({ ...schemaData, columns: newCols });
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-6 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={col.primaryKey}
                              onChange={(e) => {
                                const newCols = [...schemaData.columns];
                                newCols[idx].primaryKey = e.target.checked;
                                onSchemaChange({ ...schemaData, columns: newCols });
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-6 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={col.autoIncrement}
                              onChange={(e) => {
                                const newCols = [...schemaData.columns];
                                newCols[idx].autoIncrement = e.target.checked;
                                onSchemaChange({ ...schemaData, columns: newCols });
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-6 py-3">
                            <input
                              type="text"
                              value={col.defaultValue || ''}
                              placeholder="NULL"
                              onChange={(e) => {
                                const newCols = [...schemaData.columns];
                                newCols[idx].defaultValue = e.target.value;
                                onSchemaChange({ ...schemaData, columns: newCols });
                              }}
                              className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-xs text-slate-500"
                            />
                          </td>
                          <td className="px-6 py-3">
                            <input
                              type="text"
                              value={col.comment || ''}
                              placeholder="字段注释（可选）"
                              onChange={(e) => {
                                const newCols = [...schemaData.columns];
                                newCols[idx].comment = e.target.value;
                                onSchemaChange({ ...schemaData, columns: newCols });
                              }}
                              className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-xs text-slate-500"
                            />
                          </td>
                          <td className="px-6 py-3 text-center">
                            <button
                              onClick={() => {
                                const newCols = schemaData.columns.filter(c => c.id !== col.id);
                                onSchemaChange({ ...schemaData, columns: newCols });
                              }}
                              className="text-slate-300 hover:text-red-500 transition-colors p-1"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-0">
                    <table className="w-full border-collapse">
                      <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                        <tr>
                          <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">索引名称</th>
                          <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">包含字段</th>
                          <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-24">唯一</th>
                          <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-16">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {schemaData.indexes.map((idx, i) => (
                          <motion.tr
                            key={idx.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="group hover:bg-slate-50/50 transition-colors"
                          >
                            <td className="px-6 py-3">
                              <input
                                type="text"
                                value={idx.name}
                                onChange={(e) => {
                                  const newIdxs = [...schemaData.indexes];
                                  newIdxs[i].name = e.target.value;
                                  onSchemaChange({ ...schemaData, indexes: newIdxs });
                                }}
                                className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm font-mono text-slate-700 font-semibold"
                              />
                            </td>
                            <td className="px-6 py-3">
                              <div className="flex flex-wrap gap-1">
                                {idx.columns.map((colName: string, colIdx: number) => (
                                  <div key={colIdx} className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded flex items-center gap-1 text-xs font-semibold">
                                    {colName}
                                    <X
                                      size={10}
                                      className="cursor-pointer hover:text-red-500"
                                      onClick={() => {
                                        const newIdxs = [...schemaData.indexes];
                                        newIdxs[i].columns = newIdxs[i].columns.filter((_: any, ci: number) => ci !== colIdx);
                                        onSchemaChange({ ...schemaData, indexes: newIdxs });
                                      }}
                                    />
                                  </div>
                                ))}
                                <select
                                  value=""
                                  onChange={(e) => {
                                    if (!e.target.value) return;
                                    const newIdxs = [...schemaData.indexes];
                                    if (!newIdxs[i].columns.includes(e.target.value)) {
                                      newIdxs[i].columns.push(e.target.value);
                                      onSchemaChange({ ...schemaData, indexes: newIdxs });
                                    }
                                  }}
                                  className="text-xs bg-slate-100 border-none rounded px-1 outline-none text-slate-500 cursor-pointer"
                                >
                                  <option value="">+ 添加字段</option>
                                  {schemaData.columns.map(c => (
                                    <option key={c.name} value={c.name}>{c.name}</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="px-6 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={idx.unique}
                                onChange={(e) => {
                                  const newIdxs = [...schemaData.indexes];
                                  newIdxs[i].unique = e.target.checked;
                                  onSchemaChange({ ...schemaData, indexes: newIdxs });
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-6 py-3 text-center">
                              <button
                                onClick={() => {
                                  const newIdxs = schemaData.indexes.filter((_, idxIdx) => idxIdx !== i);
                                  onSchemaChange({ ...schemaData, indexes: newIdxs });
                                }}
                                className="text-slate-300 hover:text-red-500 transition-colors p-1"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                    {schemaData.indexes.length === 0 && (
                      <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
                        <Activity size={32} className="opacity-20" />
                        <p className="text-sm">暂无索引，点击右上角添加</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
                <button
                  onClick={() => onClose()}
                  className="px-6 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 transition-all"
                >
                  取消
                </button>
                {!readOnly && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onSave}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
                >
                  <Server size={14} /> 保存修改
                </motion.button>
                )}
              </div>
            </motion.div>
          </div>
  );
};

export default SchemaEditorModal;
