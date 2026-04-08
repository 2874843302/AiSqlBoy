import React from 'react';
import { Settings, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

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
  /** Tailwind z-index class when stacking above other modals (default z-[210]) */
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
  return (
    <AnimatePresence>
      {show && (
        <div className={`fixed inset-0 ${overlayZClass} flex items-center justify-center p-6`}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-[400px] overflow-hidden z-10"
          >
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-slate-50 to-transparent">
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
                  <motion.button
                    key={i}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      btn.onClick();
                      onCancel();
                    }}
                    className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all ${
                      btn.variant === 'primary'
                        ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-200'
                        : btn.variant === 'danger'
                          ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200'
                          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                    }`}
                  >
                    {btn.label}
                  </motion.button>
                ))
              ) : (
                <>
                  <button
                    onClick={onCancel}
                    className="flex-1 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 transition-all"
                  >
                    取消
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      onConfirm?.();
                      onCancel();
                    }}
                    className={`flex-1 py-3 rounded-2xl text-sm font-bold text-white shadow-lg transition-all ${
                      type === 'danger'
                        ? 'bg-red-500 hover:bg-red-600 shadow-red-200'
                        : type === 'warning'
                          ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'
                          : 'bg-blue-500 hover:bg-blue-600 shadow-blue-200'
                    }`}
                  >
                    确定
                  </motion.button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmModal;
