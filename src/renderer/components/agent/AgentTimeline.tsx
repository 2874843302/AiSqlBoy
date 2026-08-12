import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentMessage } from '../../../shared/agentTypes';

type AgentTimelineProps = {
  /** 已合并的消息列表（不含 tool_result），索引与渲染行一一对应 */
  messages: AgentMessage[];
  /** 消息滚动容器 */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** 点击节点跳转后回调（用于高亮目标行） */
  onJump: (index: number) => void;
};

/** 生成节点的悬浮摘要文本（mergedMessages 实际只含 user/assistant） */
const summaryOf = (msg: AgentMessage): string => {
  if (msg.role === 'user') return msg.content.trim().slice(0, 36) || '（空消息）';
  if (msg.role !== 'assistant') return '工具结果';
  const actionCount = msg.actions?.length || 0;
  const text = msg.content.trim();
  if (text) return (actionCount > 0 ? `[${actionCount}动作] ` : '') + text.slice(0, 36);
  if (actionCount > 0) return `执行了 ${actionCount} 个动作`;
  return '思考中...';
};

const formatTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

/**
 * Agent 对话悬浮时间线（仅显示自己发出的消息）：
 * - 每条用户消息一个节点，按顺序均匀分布在左侧竖轨上
 * - 悬停显示时间 + 内容摘要，点击平滑滚动定位到对应消息
 * - 滚动时自动高亮当前视口对应的节点
 */
const AgentTimeline: React.FC<AgentTimelineProps> = ({ messages, scrollRef, onJump }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [railHeight, setRailHeight] = useState(0);

  // 测量可用高度，节点间距固定 26px，超出时才等比压缩（Qoder 式紧凑时间线）
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRailHeight(el.clientHeight));
    ro.observe(el);
    setRailHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // 只取用户消息，保留其在 mergedMessages 中的真实索引（对应行锚点 data-msg-index）
  const userEntries = useMemo(
    () => messages.map((msg, index) => ({ msg, index })).filter((e) => e.msg.role === 'user'),
    [messages]
  );

  // 根据滚动位置计算当前视口对应的用户消息（视口 40% 线以上最后一条消息，归位到其前方最近的用户消息）
  const computeActive = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const rows = container.querySelectorAll<HTMLElement>('[data-msg-index]');
    if (rows.length === 0 || userEntries.length === 0) return;
    const threshold = container.getBoundingClientRect().top + container.clientHeight * 0.4;
    let lastAbove = -1;
    rows.forEach((row) => {
      if (row.getBoundingClientRect().top <= threshold) {
        lastAbove = Number(row.dataset.msgIndex || 0);
      }
    });
    let current = userEntries[0].index;
    for (const entry of userEntries) {
      if (entry.index <= lastAbove) current = entry.index;
      else break;
    }
    setActiveIndex(current);
  }, [scrollRef, userEntries]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(computeActive);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    computeActive();
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [computeActive, messages.length, scrollRef]);

  const jumpTo = (index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const row = container.querySelector<HTMLElement>(`[data-msg-index="${index}"]`);
    if (!row) return;
    const delta = row.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTo({ top: container.scrollTop + delta - 28, behavior: 'smooth' });
    onJump(index);
  };

  if (userEntries.length < 2) return null;

  // 紧凑布局：理想间距 26px，可用高度不足时等比压缩
  const gap = railHeight > 0 ? Math.min(26, railHeight / (userEntries.length - 1)) : 26;

  return (
    <div
      ref={railRef}
      className="absolute left-2 top-8 bottom-8 z-10 w-4 flex flex-col items-center justify-center select-none"
    >
      <div className="relative flex flex-col items-center" style={{ gap: `${gap}px` }}>
        {/* 竖线：只连接首尾节点中心 */}
        <div className="absolute left-1/2 -translate-x-1/2 w-px bg-slate-200" style={{ top: 8, bottom: 8 }} />
        {userEntries.map((entry) => {
          const isActive = entry.index === activeIndex;
          const isHover = entry.index === hoverIndex;
          return (
            <button
              key={entry.index}
              type="button"
              onClick={() => jumpTo(entry.index)}
              onMouseEnter={() => setHoverIndex(entry.index)}
              onMouseLeave={() => setHoverIndex(null)}
              className="relative p-1 group"
              title={`${formatTime(entry.msg.timestamp)} 我`}
            >
              <span
                className={`block rounded-full transition-all duration-150 ${
                  isActive || isHover ? 'bg-indigo-600 w-2.5 h-2.5' : 'bg-indigo-400 w-2 h-2'
                }`}
              />
              {/* 悬停摘要卡片 */}
              {isHover && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-slate-900 text-white rounded-lg shadow-xl whitespace-nowrap pointer-events-none">
                  <div className="text-[9px] text-slate-400 font-semibold">
                    {formatTime(entry.msg.timestamp)} · 我
                  </div>
                  <div className="text-[11px] font-medium mt-0.5 max-w-[240px] truncate">
                    {summaryOf(entry.msg)}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AgentTimeline;
