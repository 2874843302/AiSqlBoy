import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

export type ContextMenuOption = {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
};

type ContextMenuProps = {
  x: number;
  y: number;
  options: ContextMenuOption[];
  onClose: () => void;
};

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, options, onClose }) => {
  useEffect(() => {
    const handleClick = () => onClose();
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{ top: y, left: x }}
      className="fixed z-[100] bg-white border border-slate-200 rounded-xl shadow-2xl py-1.5 min-w-[160px] overflow-hidden"
    >
      {options.map((opt, i) => (
        <button
          key={i}
          onClick={(e) => {
            e.stopPropagation();
            opt.onClick();
            onClose();
          }}
          className={`w-full px-4 py-2 text-sm text-left flex items-center gap-3 transition-colors ${
            opt.danger ? 'text-red-500 hover:bg-red-50' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'
          }`}
        >
          {opt.icon}
          <span className="font-medium">{opt.label}</span>
        </button>
      ))}
    </motion.div>
  );
};

export default ContextMenu;
