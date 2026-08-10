import React from 'react';
import { motion } from 'framer-motion';
import { X, Terminal, Play, Activity, ChevronRight } from 'lucide-react';
import type { ConsoleTab } from '../../types/console';

type LoadConsoleModalProps = {
  savedConsoles: ConsoleTab[];
  openIds: string[];
  onClose: () => void;
  onRestore: (tab: ConsoleTab) => void;
};

const LoadConsoleModal: React.FC<LoadConsoleModalProps> = ({ savedConsoles, openIds, onClose, onRestore }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200"
      >
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Terminal size={20} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">恢复控制台</h3>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">选择要重新加载的查询控制台</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-8 max-h-[400px] overflow-y-auto custom-scrollbar bg-slate-50/50">
          <div className="grid grid-cols-1 gap-3">
            {savedConsoles.length > 0 ? (
               savedConsoles.map((tab, idx) => {
                 const isOpen = openIds.includes(tab.id);
                 return (
                   <motion.div
                     key={tab.id || `saved-${idx}`}
                    whileHover={{ scale: 1.01, x: 5 }}
                    onClick={() => onRestore(tab)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isOpen 
                      ? 'bg-blue-50/50 border-blue-100' 
                      : 'bg-white border-slate-200 hover:border-blue-400 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-xl ${isOpen ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                        <Play size={16} />
                      </div>
                      <div>
                        <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                          {tab.name}
                          {isOpen && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full uppercase">已打开</span>}
                        </div>
                        <div className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-2">
                          <Activity size={12} />
                          {tab.dbName} {tab.tableName ? `· ${tab.tableName}` : ''}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={16} className={isOpen ? 'text-blue-400' : 'text-slate-300'} />
                  </motion.div>
                );
              })
            ) : (
              <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-3">
                <Terminal size={48} className="opacity-10" />
                <p className="font-bold text-sm">暂无已保存的控制台</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-8 py-6 border-t border-slate-100 bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all"
          >
            关闭
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default LoadConsoleModal;
