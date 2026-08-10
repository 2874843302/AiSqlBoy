import React from 'react';
import { motion } from 'framer-motion';
import { X, Database } from 'lucide-react';

type SchemaFilterModalProps = {
  connectionName: string;
  databases: string[];
  draft: string[];
  onDraftChange: React.Dispatch<React.SetStateAction<string[]>>;
  onClose: () => void;
  onSave: () => void;
};

const SchemaFilterModal: React.FC<SchemaFilterModalProps> = ({
  connectionName,
  databases,
  draft,
  onDraftChange,
  onClose,
  onSave
}) => {
  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/25"
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="bg-white border border-slate-200 rounded-[28px] shadow-2xl w-[560px] max-h-[80vh] flex flex-col overflow-hidden z-10"
      >
        <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-transparent flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">选择展示的数据库架构</h3>
            <p className="text-xs text-slate-500 mt-1">{connectionName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2">
          <button
            onClick={() => onDraftChange([...databases])}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"
          >
            全选
          </button>
          <button
            onClick={() => onDraftChange([])}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            显示全部（不筛选）
          </button>
          <span className="ml-auto text-xs text-slate-400">
            已选 {draft.length} / {databases.length}
          </span>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-1 custom-scrollbar">
          {databases.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-8">暂无可选架构</div>
          ) : (
            databases.map((db) => {
              const checked = draft.includes(db);
              return (
                <label
                  key={db}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${
                    checked ? 'border-blue-100 bg-blue-50/60' : 'border-transparent hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onDraftChange((prev) => [...prev, db]);
                      } else {
                        onDraftChange((prev) => prev.filter((x) => x !== db));
                      }
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <Database size={14} className={checked ? 'text-blue-500' : 'text-slate-400'} />
                  <span className="text-sm font-medium text-slate-700 truncate">{db}</span>
                </label>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100"
          >
            取消
          </button>
          <button
            onClick={onSave}
            className="px-6 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20"
          >
            保存筛选
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default SchemaFilterModal;
