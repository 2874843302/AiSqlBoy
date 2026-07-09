import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Info, XCircle, X } from 'lucide-react';
import { motion } from 'framer-motion';

type ToastProps = {
  message: string;
  type?: 'error' | 'success' | 'info';
  onClose: () => void;
};

const AUTO_CLOSE_MS = 3500;

const Toast: React.FC<ToastProps> = ({ message, type = 'error', onClose }) => {
  const [progress, setProgress] = useState(100);
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(AUTO_CLOSE_MS);

  // Reset when message/type changes
  useEffect(() => {
    remainingRef.current = AUTO_CLOSE_MS;
    setProgress(100);
    setPaused(false);
  }, [message, type]);

  // Countdown timer — pauses on hover
  useEffect(() => {
    if (paused) return;

    let lastTick = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTick;
      lastTick = now;
      remainingRef.current = Math.max(0, remainingRef.current - delta);
      setProgress((remainingRef.current / AUTO_CLOSE_MS) * 100);

      if (remainingRef.current <= 0) {
        clearInterval(interval);
        onClose();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [paused, onClose]);

  const config = {
    error: {
      Icon: XCircle,
      iconBg: 'bg-red-500/10',
      iconColor: 'text-red-500',
      border: 'border-red-200/50',
      bg: 'bg-red-50/80',
      text: 'text-red-900',
      progress: 'bg-red-400',
      shadow: 'shadow-red-500/10',
    },
    success: {
      Icon: CheckCircle2,
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-500',
      border: 'border-emerald-200/50',
      bg: 'bg-emerald-50/80',
      text: 'text-emerald-900',
      progress: 'bg-emerald-400',
      shadow: 'shadow-emerald-500/10',
    },
    info: {
      Icon: Info,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-500',
      border: 'border-blue-200/50',
      bg: 'bg-blue-50/80',
      text: 'text-blue-900',
      progress: 'bg-blue-400',
      shadow: 'shadow-blue-500/10',
    },
  };

  const { Icon, ...c } = config[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: -24, x: '-50%', scale: 0.96 }}
      animate={{ opacity: 1, y: 28, x: '-50%', scale: 1 }}
      exit={{ opacity: 0, y: -24, x: '-50%', scale: 0.96 }}
      transition={{ type: 'spring', damping: 26, stiffness: 360 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`toast-glass fixed top-0 left-1/2 z-[200] px-5 py-4 rounded-2xl border ${c.border} ${c.bg} backdrop-blur-xl flex items-center gap-3.5 min-w-[340px] max-w-[90vw] shadow-2xl ${c.shadow} select-none`}
    >
      {/* Icon with subtle background */}
      <div className={`flex-shrink-0 w-9 h-9 rounded-xl ${c.iconBg} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${c.iconColor}`} strokeWidth={2.2} />
      </div>

      {/* Message */}
      <div className={`flex-grow text-sm font-medium leading-relaxed ${c.text}`}>{message}</div>

      {/* Close button */}
      <button
        onClick={onClose}
        className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg ${c.text} opacity-40 hover:opacity-100 hover:bg-black/5 transition-all duration-200`}
      >
        <X className="w-3.5 h-3.5" strokeWidth={2.5} />
      </button>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl overflow-hidden">
        <div
          className={`h-full ${c.progress} transition-all duration-100 ease-linear`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </motion.div>
  );
};

export default Toast;
