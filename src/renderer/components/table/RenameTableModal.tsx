import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

type RenameTableModalProps = {
  data: { oldName: string; newName: string };
  onChange: (data: { oldName: string; newName: string }) => void;
  onClose: () => void;
  onRename: () => void;
};

const RenameTableModal: React.FC<RenameTableModalProps> = ({ data, onChange, onClose, onRename }) => {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/20"
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-[400px] overflow-hidden z-10"
      >
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-slate-50 to-transparent">
          <h3 className="font-bold text-lg text-slate-900 tracking-tight">重命名数据表</h3>
          <motion.button
            whileHover={{ rotate: 90, scale: 1.1 }}
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
          >
            <X size={16} />
          </motion.button>
        </div>

        <div className="p-8 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">旧名称</label>
            <input
              type="text"
              disabled
              className="w-full bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 text-slate-400 outline-none transition-all"
              value={data.oldName}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">新名称</label>
            <input
              type="text"
              autoFocus
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
              value={data.newName}
              onChange={(e) => onChange({ ...data, newName: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && onRename()}
            />
          </div>
        </div>

        <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 transition-all"
          >
            取消
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onRename}
            className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-blue-600/20 transition-all"
          >
            确认重命名
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default RenameTableModal;
