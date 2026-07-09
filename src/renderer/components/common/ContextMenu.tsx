import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';

export type ContextMenuOption = {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  /** 子菜单项，设置此项后 onClick 失效，hover 时展开子菜单 */
  children?: ContextMenuOption[];
};

type ContextMenuProps = {
  x: number;
  y: number;
  options: ContextMenuOption[];
  onClose: () => void;
};

/** 单个菜单项（支持子菜单） */
const MenuItem: React.FC<{
  option: ContextMenuOption;
  onClose: () => void;
}> = ({ option, onClose }) => {
  const [showSub, setShowSub] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [subPos, setSubPos] = useState({ x: 0, y: 0 });

  // 用 ref 固定 option，子菜单位置仅首次打开时计算
  const optionRef = useRef(option);
  optionRef.current = option;
  const hasSub = !!option.children && option.children.length > 0;

  // 延迟显示/隐藏子菜单，避免闪烁
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (!hasSub) return;
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    enterTimer.current = setTimeout(() => {
      setShowSub(true);
    }, 180);
  };

  const handleMouseLeave = () => {
    if (!hasSub) return;
    if (enterTimer.current) clearTimeout(enterTimer.current);
    leaveTimer.current = setTimeout(() => {
      setShowSub(false);
    }, 250);
  };

  useEffect(() => {
    return () => {
      if (enterTimer.current) clearTimeout(enterTimer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  // 子菜单展开后定位，避免溢出右边界
  useEffect(() => {
    if (!showSub || !subRef.current || !itemRef.current) return;
    const itemRect = itemRef.current.getBoundingClientRect();
    const subEl = subRef.current;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    let subX: number, subY: number;
    // 默认在右侧展开，若溢出则切到左侧
    if (itemRect.right + subEl.offsetWidth + 8 > viewW) {
      subX = itemRect.left - subEl.offsetWidth;
    } else {
      subX = itemRect.right;
    }
    subY = Math.min(itemRect.top, Math.max(8, viewH - subEl.offsetHeight - 8));
    setSubPos({ x: subX, y: subY });
  }, [showSub]);

  if (optionRef.current.children && optionRef.current.children.length > 0) {
    return (
      <div
        ref={itemRef}
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          className={`w-full px-4 py-2 text-sm text-left flex items-center gap-3 transition-colors ${
            option.danger ? 'text-red-500 hover:bg-red-50' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {option.icon}
          <span className="font-medium flex-1">{option.label}</span>
          <ChevronRight size={12} className="text-slate-300" />
        </button>
        <AnimatePresence>
          {showSub && (
            <motion.div
              ref={subRef}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              style={{ left: subPos.x, top: subPos.y, position: 'fixed', zIndex: 200 }}
              className="bg-white border border-slate-200 rounded-xl shadow-2xl py-1.5 min-w-[130px]"
            >
              {option.children!.map((child, ci) => (
                <button
                  key={ci}
                  className={`w-full px-4 py-2 text-sm text-left flex items-center gap-3 transition-colors ${
                    child.danger ? 'text-red-500 hover:bg-red-50' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    child.onClick?.();
                    onClose();
                  }}
                >
                  {child.icon}
                  <span className="font-medium">{child.label}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <button
      className={`w-full px-4 py-2 text-sm text-left flex items-center gap-3 transition-colors ${
        option.danger ? 'text-red-500 hover:bg-red-50' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        option.onClick?.();
        onClose();
      }}
    >
      {option.icon}
      <span className="font-medium">{option.label}</span>
    </button>
  );
};

const ContextMenu: React.FC<ContextMenuProps> = React.memo(({ x, y, options, onClose }) => {
  // 使用 ref 固定 onClose 引用，避免父组件重渲染导致监听器反复注册
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handleClick = () => onCloseRef.current();
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // 计算菜单位置，避免溢出视口
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = React.useState({ x, y });

  useEffect(() => {
    const el = menuRef.current;
    if (!el) {
      setAdjustedPos({ x, y });
      return;
    }
    const rect = el.getBoundingClientRect();
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    let finalX = x;
    let finalY = y;

    // 水平方向溢出时，左移菜单
    if (x + rect.width > viewW - 8) {
      finalX = Math.max(8, viewW - rect.width - 8);
    }
    // 垂直方向溢出时，上移菜单
    if (y + rect.height > viewH - 8) {
      finalY = Math.max(8, viewH - rect.height - 8);
    }
    setAdjustedPos({ x: finalX, y: finalY });
  }, [x, y, options.length]);

  // 点击菜单自身不关闭，由上层 window click 处理
  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{ top: adjustedPos.y, left: adjustedPos.x }}
      className="fixed z-[100] bg-white border border-slate-200 rounded-xl shadow-2xl py-1.5 min-w-[160px]"
      onClick={handleMenuClick}
    >
      {options.map((opt, i) => (
        <MenuItem
          key={i}
          option={opt}
          onClose={onClose}
        />
      ))}
    </motion.div>
  );
});

export default ContextMenu;