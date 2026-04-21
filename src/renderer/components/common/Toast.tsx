import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw, X } from 'lucide-react';
import { motion } from 'framer-motion';

type ToastProps = {
  message: string;
  type?: 'error' | 'success' | 'info';
  onClose: () => void;
};

const Toast: React.FC<ToastProps> = ({ message, type = 'error', onClose }) => {
  const AUTO_CLOSE_MS = 3000;
  const [remainingMs, setRemainingMs] = useState(AUTO_CLOSE_MS);

  useEffect(() => {
    setRemainingMs(AUTO_CLOSE_MS);
    const timer = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [message, type, onClose]);

  useEffect(() => {
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = Math.max(0, AUTO_CLOSE_MS - elapsed);
      setRemainingMs(next);
    }, 100);
    return () => clearInterval(tick);
  }, [message, type]);

  const colors = {
    error: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  const icons = {
    error: <X className="w-5 h-5 text-red-500" />,
    success: <RefreshCw className="w-5 h-5 text-emerald-500" />,
    info: <Activity className="w-5 h-5 text-blue-500" />
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, x: '-50%' }}
      animate={{ opacity: 1, y: 20, x: '-50%' }}
      exit={{ opacity: 0, y: -20, x: '-50%' }}
      className={`fixed top-0 left-1/2 z-[200] px-4 py-3 rounded-xl border shadow-xl flex items-center gap-3 min-w-[320px] max-w-[90vw] ${colors[type]}`}
    >
      <div className="flex-shrink-0">{icons[type]}</div>
      <div className="flex-grow text-sm font-medium leading-relaxed">{message}</div>
      <div className="flex-shrink-0 text-xs font-bold opacity-70 tabular-nums min-w-[2.5rem] text-right">
        {Math.ceil(remainingMs / 1000)}s
      </div>
      <button onClick={onClose} className="flex-shrink-0 p-1 hover:bg-black/5 rounded-lg transition-colors">
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

export default Toast;
