import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

/**
 * 下拉选择原语
 *
 * 替代原生 <select>：原生控件的弹出列表由操作系统渲染，
 * 选项样式与滚动条都无法用 CSS 控制（Windows 下尤其明显），
 * 所以这里用「按钮 + portal 面板」自己实现，保证所有下拉框视觉一致。
 *
 * 无障碍按 combobox / listbox 模式实现，焦点保留在触发按钮上，
 * 通过 aria-activedescendant 指示当前高亮项。
 */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SelectVariant = 'default' | 'ghost' | 'compact' | 'bare';
export type SelectSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<SelectVariant, string> = {
  default:
    'bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15',
  ghost:
    'bg-white border border-slate-200 shadow-sm hover:border-blue-200 hover:bg-blue-50/40 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15',
  compact:
    'bg-slate-100 border border-transparent hover:bg-slate-200/70 focus:bg-white focus:border-blue-400',
  bare: 'bg-transparent border border-transparent hover:bg-slate-100',
};

const SIZE_CLASS: Record<SelectSize, string> = {
  sm: 'text-[11px] px-2 py-1 gap-1 rounded-lg',
  md: 'text-xs px-2.5 py-1.5 gap-1.5 rounded-lg',
  lg: 'text-sm px-4 py-3 gap-2 rounded-2xl',
};

const ITEM_HEIGHT = 32;
const MENU_PADDING = 8;

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** value 为空时显示的占位文案 */
  placeholder?: string;
  disabled?: boolean;
  variant?: SelectVariant;
  size?: SelectSize;
  /** 完全接管触发按钮的类名（覆盖 variant / size） */
  triggerClassName?: string;
  className?: string;
  /** 面板最大高度，超出后滚动 */
  maxMenuHeight?: number;
  ariaLabel?: string;
  /** 面板最小宽度，默认跟随触发按钮 */
  minMenuWidth?: number;
  /** 触发按钮左侧的图标（不参与面板渲染） */
  leadingIcon?: React.ReactNode;
  /** 接管根容器的类名（默认 relative），用于绝对定位覆盖等特殊场景 */
  rootClassName?: string;
}

const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  placeholder = '请选择',
  disabled = false,
  variant = 'default',
  size = 'md',
  triggerClassName,
  className = '',
  maxMenuHeight = 280,
  ariaLabel,
  minMenuWidth = 140,
  leadingIcon,
  rootClassName,
}) => {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number }>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: maxMenuHeight,
  });

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value]
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = Math.min(maxMenuHeight, options.length * ITEM_HEIGHT + MENU_PADDING);
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < menuHeight + 8 && rect.top > menuHeight + 8;

    setPosition({
      top: placeAbove ? rect.top - menuHeight - 4 : rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, minMenuWidth),
      maxHeight: maxMenuHeight,
    });
  }, [maxMenuHeight, minMenuWidth, options.length]);

  const openMenu = useCallback(() => {
    if (disabled) return;
    updatePosition();
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [disabled, selectedIndex, updatePosition]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      onChange(option.value);
      closeMenu();
      triggerRef.current?.focus();
    },
    [closeMenu, onChange, options]
  );

  // 打开时定位，并在窗口尺寸变化时重新定位
  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handleResize = () => updatePosition();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [open, updatePosition]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    // 延后绑定，避免触发按钮自身的 click 立即关闭
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [open, closeMenu]);

  // 容器滚动时关闭，避免面板与触发器脱位（面板内部滚动除外）
  useEffect(() => {
    if (!open) return;
    const handler = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      closeMenu();
    };
    window.addEventListener('scroll', handler, true);
    return () => window.removeEventListener('scroll', handler, true);
  }, [open, closeMenu]);

  const moveActive = (delta: number) => {
    if (!options.length) return;
    let next = activeIndex;
    for (let i = 0; i < options.length; i += 1) {
      next = (next + delta + options.length) % options.length;
      if (!options[next]?.disabled) break;
    }
    setActiveIndex(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openMenu();
        else moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openMenu();
        else moveActive(-1);
        break;
      case 'Home':
        if (!open) return;
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        if (!open) return;
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!open) openMenu();
        else if (activeIndex >= 0) commit(activeIndex);
        break;
      case 'Escape':
        if (!open) return;
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        break;
      case 'Tab':
        if (open) closeMenu();
        break;
      default:
        break;
    }
  };

  const listId = `${id}-listbox`;

  return (
    <div className={rootClassName ?? `relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        className={
          triggerClassName ??
          `w-full flex items-center justify-between text-left font-semibold text-slate-700 outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]}`
        }
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {leadingIcon ? <span className="shrink-0">{leadingIcon}</span> : null}
          <span className={`truncate ${selectedOption ? '' : 'text-slate-400 font-normal'}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
              className="z-[400] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-300/30"
            >
              {options.length === 0 ? (
                <div className="px-2.5 py-2 text-[11px] text-slate-400">无可选项</div>
              ) : (
                options.map((option, index) => {
                  const isSelected = option.value === value;
                  const isActive = index === activeIndex;
                  return (
                    <div
                      key={`${option.value}-${index}`}
                      id={`${id}-option-${index}`}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled || undefined}
                      onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                      onClick={() => commit(index)}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                        option.disabled
                          ? 'text-slate-300 cursor-not-allowed'
                          : isSelected
                            ? 'text-blue-600 font-medium bg-blue-50 cursor-pointer'
                            : isActive
                              ? 'text-slate-800 bg-slate-100 cursor-pointer'
                              : 'text-slate-600 cursor-pointer'
                      }`}
                    >
                      <span className="truncate">{option.label}</span>
                      {isSelected ? <Check size={13} className="shrink-0 text-blue-600" /> : null}
                    </div>
                  );
                })
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export default Select;
