import React from 'react';
import { Settings, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Modal, Button } from '../../ui';

type ConfirmButton = {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
};

type ConfirmModalProps = {
  show: boolean;
  title: string;
  message: string;
  type?: 'warning' | 'danger' | 'info';
  buttons?: ConfirmButton[];
  onConfirm?: () => void;
  onCancel: () => void;
  /** 叠加在其他弹窗之上时的层级类名（默认 z-[210]） */
  overlayZClass?: string;
};

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  show,
  title,
  message,
  type = 'warning',
  buttons,
  onConfirm,
  onCancel,
  overlayZClass = 'z-[210]'
}) => {
  const confirmVariant = type === 'danger' ? 'danger' : type === 'warning' ? 'warning' : 'primary';

  return (
    <AnimatePresence>
      {show && (
        <Modal onClose={onCancel} zIndexClass={overlayZClass} width="w-[400px]" ariaLabel={title}>
          <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-slate-50 to-transparent dark:from-slate-900 dark:to-slate-900">
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  type === 'danger'
                    ? 'bg-red-50 text-red-500'
                    : type === 'warning'
                      ? 'bg-amber-50 text-amber-500'
                      : 'bg-blue-50 text-blue-500'
                }`}
              >
                <Settings size={16} />
              </div>
              <h3 className="font-bold text-lg text-slate-900 tracking-tight">{title}</h3>
            </div>
            <motion.button
              whileHover={{ rotate: 90, scale: 1.1 }}
              onClick={onCancel}
              aria-label="关闭"
              className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
            >
              <X size={16} />
            </motion.button>
          </div>

          <div className="p-8">
            <p className="text-slate-600 text-sm leading-relaxed font-medium">{message}</p>
          </div>

          <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex gap-3">
            {buttons ? (
              buttons.map((btn, i) => (
                <Button
                  key={i}
                  size="lg"
                  variant={btn.variant === 'primary' ? 'primary' : btn.variant === 'danger' ? 'danger' : 'ghost'}
                  className="flex-1"
                  onClick={() => {
                    btn.onClick();
                    onCancel();
                  }}
                >
                  {btn.label}
                </Button>
              ))
            ) : (
              <>
                <Button size="lg" variant="ghost" className="flex-1" onClick={onCancel}>
                  取消
                </Button>
                <Button
                  size="lg"
                  variant={confirmVariant}
                  className="flex-1"
                  onClick={() => {
                    onConfirm?.();
                    onCancel();
                  }}
                >
                  确定
                </Button>
              </>
            )}
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
};

export default ConfirmModal;
