import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 轻量 Tooltip
 *
 * 替代满屏的 title 属性（延迟长、样式不可控、暗色主题下几乎看不见）。
 * 用 portal + fixed 定位，避免被父级 overflow 裁切。
 * 仅响应 hover 与 focus，不做长按/触摸，桌面端够用。
 */

export interface TooltipProps {
  label: string;
  children: React.ReactElement;
  side?: 'top' | 'bottom';
  className?: string;
}

const Tooltip: React.FC<TooltipProps> = ({ label, children, side = 'top', className = '' }) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // 轻微延迟，避免扫过一排图标时闪现
    timerRef.current = setTimeout(() => setVisible(true), 240);
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const offset = 8;
    setPosition({
      top: side === 'top' ? rect.top - offset : rect.bottom + offset,
      left: Math.min(Math.max(rect.left + rect.width / 2, 60), window.innerWidth - 60),
    });
  }, [visible, side]);

  const trigger = React.cloneElement(children as React.ReactElement<any>, {
    ref: (node: HTMLElement | null) => {
      anchorRef.current = node;
      const originalRef = (children as any).ref;
      if (typeof originalRef === 'function') originalRef(node);
      else if (originalRef && typeof originalRef === 'object') originalRef.current = node;
    },
    onMouseEnter: (event: React.MouseEvent) => {
      (children.props as any).onMouseEnter?.(event);
      show();
    },
    onMouseLeave: (event: React.MouseEvent) => {
      (children.props as any).onMouseLeave?.(event);
      hide();
    },
    onFocus: (event: React.FocusEvent) => {
      (children.props as any).onFocus?.(event);
      show();
    },
    onBlur: (event: React.FocusEvent) => {
      (children.props as any).onBlur?.(event);
      hide();
    },
  });

  return (
    <>
      {trigger}
      {visible && label
        ? createPortal(
            <div
              role="tooltip"
              style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                transform: `translate(-50%, ${side === 'top' ? '-100%' : '0'})`,
              }}
              className={`pointer-events-none z-[400] max-w-[240px] rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] leading-snug text-white shadow-lg ${className}`}
            >
              {label}
            </div>,
            document.body
          )
        : null}
    </>
  );
};

export default Tooltip;
