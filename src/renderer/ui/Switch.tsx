import React from 'react';

/**
 * 开关原语
 *
 * 之前设置页里手写过一次，MCP 开关是第二份；抽出来后颜色由 tone 决定。
 */

export type SwitchTone = 'indigo' | 'amber' | 'emerald';

const TONE_ON: Record<SwitchTone, string> = {
  indigo: 'bg-indigo-600',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-600',
};

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  tone?: SwitchTone;
  /** 无障碍名称，无可见 label 时必填 */
  label: string;
  className?: string;
}

const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  tone = 'indigo',
  label,
  className = '',
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
      checked ? TONE_ON[tone] : 'bg-slate-300'
    } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
  >
    <span
      className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
        checked ? 'left-[22px]' : 'left-0.5'
      }`}
    />
  </button>
);

export default Switch;
