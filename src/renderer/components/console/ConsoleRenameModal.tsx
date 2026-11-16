import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Modal, Button, Field } from '../../ui';

type ConsoleRenameModalProps = {
  data: { id: string; name: string };
  onClose: () => void;
  onChange: (data: { id: string; name: string }) => void;
  onSave: (id: string, name: string) => void;
};

const ConsoleRenameModal: React.FC<ConsoleRenameModalProps> = ({ data, onClose, onChange, onSave }) => {
  const submit = () => {
    onSave(data.id, data.name);
    onClose();
  };

  return (
    <Modal onClose={onClose} zIndex={220} width="w-[400px]" ariaLabel="保存或重命名控制台">
      <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-slate-50 to-transparent">
        <h3 className="font-bold text-xl text-slate-900 tracking-tight">保存/重命名控制台</h3>
        <motion.button
          whileHover={{ rotate: 90, scale: 1.1 }}
          onClick={onClose}
          aria-label="关闭"
          className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
        >
          <X size={20} />
        </motion.button>
      </div>

      <div className="p-8 space-y-4">
        <Field label="控制台名称">
          {(id) => (
            <input
              id={id}
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
              value={data.name}
              onChange={(e) => onChange({ ...data, name: e.target.value })}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          )}
        </Field>

        <div className="flex gap-3 pt-2">
          <Button size="lg" variant="ghost" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button size="lg" variant="primary" className="flex-1" onClick={submit}>
            确认保存
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ConsoleRenameModal;
