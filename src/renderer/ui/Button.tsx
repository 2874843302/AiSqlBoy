import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * 按钮原语
 *
 * 收敛的是「视觉与状态」，不接管布局：宽度由调用方用 className 决定。
 * 用 CSS 过渡而非 motion.button，避免在长列表里挂载大量动画实例。
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:hover:bg-indigo-600',
  secondary:
    'bg-white border border-slate-200 text-slate-700 shadow-sm hover:shadow-md hover:border-indigo-200',
  ghost: 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50',
  danger:
    'bg-red-500 text-white shadow-lg shadow-red-200 hover:bg-red-600 disabled:hover:bg-red-500',
  warning:
    'bg-amber-500 text-white shadow-lg shadow-amber-200 hover:bg-amber-600 disabled:hover:bg-amber-500',
  success:
    'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:hover:bg-emerald-600',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-xl gap-1.5',
  md: 'px-4 py-2 text-xs rounded-xl gap-2',
  lg: 'px-4 py-3 text-sm rounded-2xl gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** 左侧图标 */
  icon?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}) => {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
};

export default Button;
