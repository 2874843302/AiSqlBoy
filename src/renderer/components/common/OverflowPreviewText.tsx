import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';

export type OverflowPreviewTextProps = {
  text: string;
  textClassName: string;
  containerClassName?: string;
  buttonClassName: string;
  buttonTitle: string;
  buttonSize: number;
  onPreview: () => void;
  children: React.ReactNode;
};

const OverflowPreviewText = React.memo(({
  text,
  textClassName,
  containerClassName = 'flex items-center gap-3 overflow-hidden min-w-0',
  buttonClassName,
  buttonTitle,
  buttonSize,
  onPreview,
  children
}: OverflowPreviewTextProps) => {
  const textRef = React.useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    // 每次渲染后检查溢出，但只在状态变化时触发重渲染
    const overflow = el.scrollWidth > el.clientWidth + 1;
    setIsOverflowing(prev => prev !== overflow ? overflow : prev);
  });

  return (
    <div className={containerClassName}>
      <span ref={textRef} className={textClassName}>
        {children}
      </span>
      {isOverflowing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
          className={buttonClassName}
          title={buttonTitle}
        >
          <Plus size={buttonSize} />
        </button>
      )}
    </div>
  );
});

export default OverflowPreviewText;
