import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Modal, Button, Field } from '../../ui';

type RenameTableModalProps = {
  data: { oldName: string; newName: string };
  onChange: (data: { oldName: string; newName: string }) => void;
  onClose: () => void;
  onRename: () => void;
};

const RenameTableModal: React.FC<RenameTableModalProps> = ({ data, onChange, onClose, onRename }) => (
  <Modal onClose={onClose} zIndex={110} width="w-[400px]" ariaLabel="重命名数据表">
    <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-slate-50 to-transparent">
      <h3 className="font-bold text-lg text-slate-900 tracking-tight">重命名数据表</h3>
      <motion.button
        whileHover={{ rotate: 90, scale: 1.1 }}
        onClick={onClose}
        aria-label="关闭"
        className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
      >
        <X size={16} />
      </motion.button>
    </div>

    <div className="p-8 space-y-4">
      <Field label="旧名称">
        {(id) => (
          <input
            id={id}
            type="text"
            disabled
            className="w-full bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 text-slate-400 outline-none transition-all"
            value={data.oldName}
          />
        )}
      </Field>
      <Field label="新名称">
        {(id) => (
          <input
            id={id}
            type="text"
            autoFocus
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
            value={data.newName}
            onChange={(e) => onChange({ ...data, newName: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && onRename()}
          />
        )}
      </Field>
    </div>

    <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex gap-3">
      <Button size="lg" variant="ghost" className="flex-1" onClick={onClose}>
        取消
      </Button>
      <Button size="lg" variant="primary" className="flex-[2]" onClick={onRename}>
        确认重命名
      </Button>
    </div>
  </Modal>
);

export default RenameTableModal;
