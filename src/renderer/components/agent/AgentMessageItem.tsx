import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Bot, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ActionCard from './ActionCard';
import type { AgentMessage } from '../../../shared/agentTypes';

const SqlCodeBlock: React.FC<{ content: string }> = ({ content }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="mt-2 relative">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] font-medium transition-colors"
        title="复制 SQL"
      >
        {copied ? <Check size={10} /> : <Copy size={10} />}
        {copied ? '已复制' : '复制'}
      </button>
      <div className="bg-slate-900 rounded-lg p-3 font-mono text-[11px] text-slate-300 overflow-x-auto">
        <pre className="whitespace-pre">{content}</pre>
      </div>
    </div>
  );
};

type AgentMessageItemProps = {
  message: AgentMessage;
  onApprove?: (actionId: string) => void;
  onReject?: (actionId: string) => void;
};

const AgentMessageItem: React.FC<AgentMessageItemProps> = ({ message, onApprove, onReject }) => {
  if (message.role === 'tool_result') {
    // tool_result 消息不单独渲染，而是作为 action card 的结果展示
    // 但如果该消息没有被任何 action 关联，就展示为系统消息
    return null;
  }

  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {isUser ? <User size={18} /> : <Bot size={18} />}
      </div>
      <div className={`min-w-0 ${isUser ? 'max-w-[75%]' : 'flex-1'}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
              : 'bg-white border border-slate-200 shadow-sm text-slate-700'
          }`}
        >
          {isUser ? (
            message.content
          ) : (
            <div className="markdown-content space-y-2">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                  ul: ({ node, ...props }) => <ul className="list-disc ml-4 mb-2" {...props} />,
                  ol: ({ node, ...props }) => <ol className="list-decimal ml-4 mb-2" {...props} />,
                  li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                  table: ({ node, ...props }) => (
                    <div className="my-2 overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-xs border-collapse" {...props} />
                    </div>
                  ),
                  thead: ({ node, ...props }) => <thead className="bg-slate-50" {...props} />,
                  th: ({ node, ...props }) => (
                    <th className="px-3 py-1.5 text-left font-bold text-slate-600 border-b border-slate-200 whitespace-nowrap" {...props} />
                  ),
                  td: ({ node, ...props }) => (
                    <td className="px-3 py-1.5 text-slate-600 border-b border-slate-50 whitespace-nowrap" {...props} />
                  ),
                  code: ({ node, inline, className, children, ...props }: any) => {
                    const match = /language-(\w+)/.exec(className || '');
                    const content = String(children).replace(/\n$/, '');
                    if (!inline && match && match[1] === 'sql') {
                      return <SqlCodeBlock content={content} />;
                    }
                    if (!inline && match) {
                      return (
                        <div className="mt-2 bg-slate-900 rounded-lg p-3 font-mono text-[11px] text-slate-300 overflow-x-auto">
                          <pre className="whitespace-pre">{content}</pre>
                        </div>
                      );
                    }
                    return (
                      <code
                        className={`${className} bg-slate-100 px-1 rounded text-indigo-600 font-mono text-[0.9em]`}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Render associated actions */}
        {message.role === 'assistant' && message.actions && message.actions.length > 0 && (
          <div className="mt-3 space-y-3">
            {message.actions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                onApprove={onApprove}
                onReject={onReject}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default AgentMessageItem;
