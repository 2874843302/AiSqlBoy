import React, { useId } from 'react';

/**
 * 表单字段原语
 *
 * 统一「小标题 + 控件 + 说明」的三段式结构。
 * 不内置控件样式，select / input 仍由调用方传入自己的类名，
 * 避免把不同表单的视觉差异抹平。
 */

export interface FieldProps {
  label: string;
  /** 直接传控件，或传 `(id) => 控件` 以便把 label 与控件关联 */
  children: React.ReactNode | ((controlId: string) => React.ReactNode);
  /** 说明文字，支持富文本 */
  hint?: React.ReactNode;
  /** 手动指定控件 id，不传则自动生成并传给 children 函数 */
  htmlFor?: string;
  className?: string;
}

const Field: React.FC<FieldProps> = ({ label, children, hint, htmlFor, className = '' }) => {
  const autoId = useId();
  const controlId = htmlFor ?? autoId;

  return (
    <div className={`space-y-2 ${className}`}>
      <label
        htmlFor={controlId}
        className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1"
      >
        {label}
      </label>
      {typeof children === 'function' ? children(controlId) : children}
      {hint ? <p className="text-xs text-slate-400 px-1 leading-relaxed">{hint}</p> : null}
    </div>
  );
};

export default Field;
