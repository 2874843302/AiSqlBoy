import React from 'react';
import { Play, Plus, X } from 'lucide-react';
import type { ConsoleTab } from '../../types/console';

type ConsoleTabBarProps = {
  consoles: ConsoleTab[];
  activeConsoleId: string | null;
  selectedTable: string | null;
  onSelectConsole: (id: string) => void;
  onConsoleContextMenu: (id: string, x: number, y: number) => void;
  onCloseConsole: (id: string, e: React.MouseEvent) => void;
  onOpenLoadConsoleModal: () => void;
};

const ConsoleTabBar: React.FC<ConsoleTabBarProps> = ({
  consoles,
  activeConsoleId,
  selectedTable,
  onSelectConsole,
  onConsoleContextMenu,
  onCloseConsole,
  onOpenLoadConsoleModal
}) => {
  return (
            <div className="flex bg-slate-50 border-b border-slate-200 px-4 pt-2 gap-1 overflow-x-auto custom-scrollbar items-end">
              {consoles.map((tab, idx) => (
                <div
                  key={tab.id || `console-${idx}`}
                  title={tab.name}
                  onClick={() => onSelectConsole(tab.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onConsoleContextMenu(tab.id, e.clientX, e.clientY);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-t border-x ${
                    activeConsoleId === tab.id && !selectedTable
                    ? 'bg-white border-slate-200 text-blue-600 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]' 
                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Play size={12} className={tab.executing ? 'animate-spin' : ''} />
                  <span className="truncate max-w-[120px]">{tab.name}</span>
                  {tab.isDirty && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                  <X
                    size={12}
                    className="hover:text-red-500 transition-colors"
                    onClick={(e) => onCloseConsole(tab.id, e)}
                  />
                </div>
              ))}

              {/* Add Button */}
              <button
                onClick={onOpenLoadConsoleModal}
                className="mb-1 p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-all flex-shrink-0"
                title="加载已保存的控制台"
              >
                <Plus size={16} />
              </button>
            </div>
  );
};

export default ConsoleTabBar;
