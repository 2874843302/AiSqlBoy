import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Layout, Search, ArrowUp, ArrowDown, X, FileJson, Copy } from 'lucide-react';
import { isJsonLike, formatJson, renderJsonSyntax, escapeRegExp } from '../../utils/jsonText';

export type TextDetailData = { content: any; fieldName: string };

type TextDetailModalProps = {
  detail: TextDetailData;
  onClose: () => void;
  onToast: (toast: { message: string; type: 'error' | 'success' | 'info' }) => void;
};

const TextDetailModal: React.FC<TextDetailModalProps> = ({ detail, onClose, onToast }) => {
  const [isJsonFormatted, setIsJsonFormatted] = useState(true); // JSON 默认格式化
  const [searchTerm, setSearchTerm] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [searchVisible, setSearchVisible] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const displayText = useMemo(() => {
    const rendered = isJsonFormatted
      ? formatJson(detail.content)
      : (typeof detail.content === 'object' ? JSON.stringify(detail.content) : String(detail.content ?? ''));
    return typeof rendered === 'string' ? rendered : String(rendered ?? '');
  }, [detail, isJsonFormatted]);

  const matches = useMemo(() => {
    const keyword = searchTerm.trim();
    if (!keyword || !displayText) return [] as number[];
    const source = displayText.toLowerCase();
    const target = keyword.toLowerCase();
    const indices: number[] = [];
    let start = 0;
    while (true) {
      const idx = source.indexOf(target, start);
      if (idx === -1) break;
      indices.push(idx);
      start = idx + target.length;
    }
    return indices;
  }, [displayText, searchTerm]);

  /** 搜索高亮后的 JSX 内容，独立 memo 避免每次输入都重建 React 元素 */
  const highlightedContent = useMemo(() => {
    if (!displayText) return null;
    const keyword = searchTerm.trim();
    // 无搜索关键词时：JSON 格式化则语法着色，否则原文
    if (!keyword) {
      if (isJsonFormatted && isJsonLike(detail?.content)) {
        return renderJsonSyntax(displayText);
      }
      return displayText;
    }
    // 有搜索关键词时：先做 JSON 着色再叠加搜索高亮太复杂，直接用纯文本搜索高亮
    const regex = new RegExp(`(${escapeRegExp(keyword)})`, 'gi');
    const parts = displayText.split(regex);
    let hitIndex = -1;
    return parts.map((part, index) => {
      if (part.toLowerCase() !== keyword.toLowerCase()) return part;
      hitIndex += 1;
      const isActive = hitIndex === matchIndex;
      return (
        <mark
          key={`hit-${index}`}
          data-hit-idx={hitIndex}
          className={`text-detail-modal-mark ${isActive ? 'bg-amber-300 text-slate-900' : 'bg-yellow-200 text-slate-900'} rounded px-0.5`}
        >
          {part}
        </mark>
      );
    });
  }, [displayText, searchTerm, matchIndex, isJsonFormatted, detail]);

  useEffect(() => {
    setMatchIndex(0);
  }, [searchTerm, displayText]);

  useEffect(() => {
    if (!matches.length) return;
    const marks = document.querySelectorAll<HTMLElement>('.text-detail-modal-mark');
    const target = marks[matchIndex];
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [matchIndex, matches.length]);

  // Ctrl+F 打开弹窗内查找；Escape 关闭查找
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchVisible(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
        return;
      }
      if (e.key === 'Escape' && searchVisible) {
        e.preventDefault();
        setSearchVisible(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchVisible]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-10">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 30 }}
        className="bg-white border border-slate-200 rounded-[40px] shadow-3xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden z-10"
      >
        <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-slate-50 to-transparent">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100">
              <Layout size="24" className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-2xl text-slate-900 tracking-tight">{detail.fieldName}</h3>
              <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-widest">
                详细内容预览
                <span className="font-normal normal-case tracking-normal text-slate-400/80 ml-2">Ctrl+F 查找</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {searchVisible && (
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white shadow-sm pl-1.5 pr-1 py-0.5">
                <Search size={12} className="text-slate-400 shrink-0" />
                <input
                  ref={searchInputRef}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setSearchVisible(false);
                      return;
                    }
                    if (!matches.length) return;
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setMatchIndex((prev) => (prev + 1) % matches.length);
                    }
                  }}
                  placeholder="查找"
                  className="w-[5.5rem] text-[11px] bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
                />
                <span className="text-[9px] text-slate-400 tabular-nums px-0.5 min-w-[1.75rem] text-center">
                  {matches.length ? `${matchIndex + 1}/${matches.length}` : '—'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (!matches.length) return;
                    setMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
                  }}
                  disabled={!matches.length}
                  className="w-5 h-5 rounded border border-slate-200/80 text-slate-500 hover:text-blue-600 hover:border-blue-200/80 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center"
                  title="上一个"
                >
                  <ArrowUp size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!matches.length) return;
                    setMatchIndex((prev) => (prev + 1) % matches.length);
                  }}
                  disabled={!matches.length}
                  className="w-5 h-5 rounded border border-slate-200/80 text-slate-500 hover:text-blue-600 hover:border-blue-200/80 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center"
                  title="下一个"
                >
                  <ArrowDown size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchVisible(false);
                    setSearchTerm('');
                  }}
                  className="w-5 h-5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center"
                  title="关闭查找"
                >
                  <X size={10} />
                </button>
              </div>
            )}
            <motion.button
              whileHover={{ rotate: 90, scale: 1.1 }}
              onClick={onClose}
              className="w-12 h-12 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
            >
              <X size={24} />
            </motion.button>
          </div>
        </div>
        <div className="p-10 overflow-y-auto custom-scrollbar flex-1">
          <div className="bg-slate-50 rounded-3xl p-8 border border-slate-200 shadow-inner relative">
            {/* Copy button */}
            <button
              onClick={async () => {
                try {
                  if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(displayText);
                  } else {
                    const textarea = document.createElement('textarea');
                    textarea.value = displayText;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.focus();
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                  }
                  onToast({ message: '已复制到剪贴板', type: 'success' });
                } catch (err: any) {
                  onToast({ message: err?.message || '复制失败', type: 'error' });
                }
              }}
              className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 shadow-sm transition-all"
              title="一键复制"
            >
              <Copy size={15} />
            </button>
            <pre className="whitespace-pre-wrap break-all text-[15px] leading-relaxed text-slate-700 font-mono selection:bg-blue-100 text-detail-modal">
              {highlightedContent}
            </pre>
          </div>
        </div>
        <div className="px-10 py-8 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          <div>
            {isJsonLike(detail.content) && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsJsonFormatted(!isJsonFormatted)}
                className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-bold transition-all shadow-sm ${
                  isJsonFormatted 
                  ? 'bg-blue-600 text-white shadow-blue-600/20' 
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <FileJson size={18} />
                {isJsonFormatted ? '查看原文' : '格式化 JSON'}
              </motion.button>
            )}
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="px-10 py-3.5 bg-white hover:bg-slate-100 text-slate-700 rounded-2xl text-sm font-bold border border-slate-200 transition-all shadow-sm"
          >
            关闭预览
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default TextDetailModal;
