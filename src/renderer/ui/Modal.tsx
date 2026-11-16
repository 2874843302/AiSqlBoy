import React, { useCallback, useEffect, useId, useRef } from 'react';
import { motion } from 'framer-motion';

/**
 * 弹窗原语
 *
 * 只负责「结构 + 动画 + 无障碍」，不干预视觉细节：
 * z-index、遮罩透明度、圆角、宽度都由调用方通过类名传入，
 * 保证替换手写实现后观感 1:1 不变。
 *
 * 挂载由调用方控制（保留 `{open && <Modal/>}` + 外层 AnimatePresence 的现有写法），
 * 本组件不自行管理 open 状态，避免嵌套 AnimatePresence 导致退出动画失效。
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** 弹窗栈：只有最上层响应 Esc，避免嵌套弹窗一起关掉 */
const modalStack: string[] = [];

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

export interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  /** 卡片内的键盘事件（Tab 循环之外的自定义处理，如 Enter 提交） */
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  /** 层级，默认 110 */
  zIndex?: number;
  /** 直接给层级类名（兼容既有调用方传入的 z-[210] 形式，优先级高于 zIndex） */
  zIndexClass?: string;
  /** 遮罩样式，默认 bg-slate-900/20 */
  backdropClassName?: string;
  /** 卡片圆角，默认 rounded-[32px] */
  rounded?: string;
  /** 卡片宽度类，默认 w-full max-w-[520px] min-w-[320px] */
  width?: string;
  /** 卡片附加类（padding / border / overflow 等） */
  className?: string;
  /** 外壳内边距，默认 p-6 */
  padding?: string;
  /** 点击遮罩是否关闭，默认 true */
  closeOnBackdrop?: boolean;
  /** Esc 是否关闭，默认 true */
  closeOnEsc?: boolean;
  /** 无障碍名称（无可见标题时必填） */
  ariaLabel?: string;
  /** 是否在挂载时把焦点移入弹窗，默认 true */
  autoFocus?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  onClose,
  children,
  onKeyDown: onKeyDownProp,
  zIndex = 110,
  zIndexClass,
  backdropClassName = 'bg-slate-900/20',
  rounded = 'rounded-[32px]',
  width = 'w-full max-w-[520px] min-w-[320px]',
  className = '',
  padding = 'p-6',
  closeOnBackdrop = true,
  closeOnEsc = true,
  ariaLabel,
  autoFocus = true,
}) => {
  const id = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  // 入栈 + 焦点接管 + 卸载还原
  useEffect(() => {
    modalStack.push(id);
    previousFocus.current = document.activeElement as HTMLElement | null;

    if (autoFocus) {
      const card = cardRef.current;
      // 已有元素持有焦点（例如输入框 autoFocus）时不抢焦点
      if (card && !card.contains(document.activeElement)) {
        const focusables = getFocusable(card);
        (focusables[0] ?? card).focus();
      }
    }

    return () => {
      const index = modalStack.indexOf(id);
      if (index >= 0) modalStack.splice(index, 1);
      const target = previousFocus.current;
      if (target && document.contains(target)) {
        target.focus({ preventScroll: true });
      }
    };
  }, [id, autoFocus]);

  // Esc 只由栈顶响应
  useEffect(() => {
    if (!closeOnEsc) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (modalStack[modalStack.length - 1] !== id) return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [id, closeOnEsc, onClose]);

  // Tab 循环限制在卡片内
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDownProp?.(event);
      if (event.defaultPrevented) return;
      if (event.key !== 'Tab') return;
      const focusables = getFocusable(cardRef.current);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !cardRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onKeyDownProp]
  );

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center ${padding} ${zIndexClass || ''}`}
      style={zIndexClass ? undefined : { zIndex }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeOnBackdrop ? onClose : undefined}
        className={`absolute inset-0 ${backdropClassName}`}
      />
      <motion.div
        ref={cardRef}
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        className={`relative bg-white border border-slate-200 ${rounded} shadow-2xl ${width} overflow-hidden outline-none ${className}`}
      >
        {children}
      </motion.div>
    </div>
  );
};

export default Modal;
