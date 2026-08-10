import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, ChevronRight, Search, X } from 'lucide-react';

type HeaderBarProps = {
  connectionName: string | null;
  loading: boolean;
  selectedDatabase: string | null;
  selectedTable: string | null;
  activeConsoleId: string | null;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchMatchesCount: number;
  currentMatchIdx: number;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onClearSearch: () => void;
};

const HeaderBar: React.FC<HeaderBarProps> = ({
  connectionName,
  loading,
  selectedDatabase,
  selectedTable,
  activeConsoleId,
  searchTerm,
  onSearchChange,
  searchInputRef,
  searchMatchesCount,
  currentMatchIdx,
  onNextMatch,
  onPrevMatch,
  onClearSearch
}) => {
  return (
    <header className="h-16 border-b border-slate-200 flex items-center px-8 justify-between bg-white/80 backdrop-blur-xl z-10 shadow-sm">
          <div className="flex items-center gap-4">
            <AnimatePresence mode="wait">
              {connectionName ? (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="flex items-center gap-3 px-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-sm shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <Activity size={14} className={loading ? 'text-yellow-500 animate-spin' : 'text-green-500'} />
                    <span className="font-bold text-slate-900 tracking-tight">{connectionName}</span>
                  </div>
                  <ChevronRight size={12} className="text-slate-300" />
                  <span className="text-slate-500 font-semibold">{selectedDatabase || '选择数据库'}</span>
                  {selectedTable && (
                    <>
                      <ChevronRight size={12} className="text-slate-300" />
                      <span className="text-blue-600 font-bold">{selectedTable}</span>
                    </>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-slate-400 text-sm font-semibold"
                >
                  就绪
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Search Bar */}
          {(selectedTable || activeConsoleId) && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/50 transition-all shadow-sm">
              <Search size={14} className="text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="搜索结果数据 (Ctrl+F)..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onNextMatch();
                  }
                  if (e.key === 'Escape') {
                    e.currentTarget.blur();
                  }
                }}
                className="bg-transparent border-none outline-none text-sm w-48 text-slate-600 placeholder:text-slate-400 font-medium"
              />
              {searchTerm && (
                <div className="flex items-center gap-2 ml-2 border-l border-slate-200 pl-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase min-w-[40px] text-center">
                    {searchMatchesCount > 0 ? `${currentMatchIdx + 1} / ${searchMatchesCount}` : '无匹配'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={onPrevMatch}
                      className="p-1 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                      title="上一个匹配"
                    >
                      <ChevronRight size={14} className="rotate-180" />
                    </button>
                    <button
                      onClick={onNextMatch}
                      className="p-1 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                      title="下一个匹配"
                    >
                      <ChevronRight size={14} />
                    </button>
                    <button
                      onClick={onClearSearch}
                      className="p-1 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-red-500"
                      title="清除搜索"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </header>
  );
};

export default HeaderBar;
