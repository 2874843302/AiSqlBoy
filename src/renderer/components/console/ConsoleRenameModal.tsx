import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

type ConsoleRenameModalProps = {
  data: { id: string; name: string };
  onClose: () => void;
  onChange: (data: { id: string; name: string }) => void;
  onSave: (id: string, name: string) => void;
};

const ConsoleRenameModal: React.FC<ConsoleRenameModalProps> = ({ data, onClose, onChange, onSave }) => {
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-6">
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
          <div>
            <h3 className="font-bold text-xl text-slate-900 tracking-tight">保存/重命名控制台</h3>
          </div>
          <motion.button
            whileHover={{ rotate: 90, scale: 1.1 }}
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
          >
            <X size={20} />
          </motion.button>
        </div>
        <div className="p-8 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">控制台名称</label>
            <input
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
              value={data.name}
              onChange={(e) => onChange({ ...data, name: e.target.value })}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSave(data.id, data.name);
                  onClose();
                }
              }}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all"
            >
              取消
            </button>
            <button
              onClick={() => {
                onSave(data.id, data.name);
                onClose();
              }}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-blue-200 transition-all"
            >
              确认保存
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ConsoleRenameModal;
