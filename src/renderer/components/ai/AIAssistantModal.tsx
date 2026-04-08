import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, Loader2, Play, Send, Sparkles, User, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

type AIMessage = { role: 'user' | 'assistant'; content: string };
type AIContext = { type: 'database' | 'table'; name: string } | null;

type AIAssistantModalProps = {
  show: boolean;
  aiContext: AIContext;
  aiMessages: AIMessage[];
  aiLoading: boolean;
  aiPrompt: string;
  setAIPrompt: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onApplySQL: (content: string) => void;
};

const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  show,
  aiContext,
  aiMessages,
  aiLoading,
  aiPrompt,
  setAIPrompt,
  onClose,
  onSubmit,
  onApplySQL
}) => {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 pointer-events-none">
      <AnimatePresence>
        {show && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/10 backdrop-blur-[2px] pointer-events-auto"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-[600px] h-[500px] overflow-hidden z-10 flex flex-col pointer-events-auto"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-indigo-50/50 to-transparent">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-indigo-600" />
                  <div>
                    <h3 className="font-bold text-base text-slate-900">AI 助手</h3>
                    <p className="text-xs text-slate-500">
                      当前上下文: {aiContext?.type === 'database' ? '数据库' : '表'} {aiContext?.name}
                    </p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ rotate: 90, scale: 1.1 }}
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                >
                  <X size={16} />
                </motion.button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50 chat-messages-container">
                {aiMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                    <Bot size={40} className="text-slate-300" />
                    <p className="text-sm">告诉我你想查什么，或者需要生成 what SQL</p>
                  </div>
                )}
                {aiMessages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                    </div>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                          : 'bg-white border border-slate-200 shadow-sm text-slate-700'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="markdown-content space-y-2">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                              ul: ({ node, ...props }) => <ul className="list-disc ml-4 mb-2" {...props} />,
                              ol: ({ node, ...props }) => <ol className="list-decimal ml-4 mb-2" {...props} />,
                              li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                              code: ({ node, inline, className, children, ...props }: any) => {
                                const match = /language-(\w+)/.exec(className || '');
                                const content = String(children).replace(/\n$/, '');
                                if (!inline && match && match[1] === 'sql') {
                                  return (
                                    <div className="mt-2">
                                      <div className="bg-slate-900 rounded-lg p-3 font-mono text-[11px] text-slate-300 overflow-x-auto">
                                        {content}
                                      </div>
                                      <button
                                        onClick={() => onApplySQL(content)}
                                        className="mt-2 w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-2 border border-indigo-100"
                                      >
                                        <Play size={12} /> 应用到控制台
                                      </button>
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
                              }
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </motion.div>
                ))}
                {aiLoading && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                      <Bot size={16} />
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin text-indigo-600" />
                      <span className="text-xs text-slate-500">AI 思考中...</span>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="p-4 bg-white border-t border-slate-100 flex gap-2">
                <input
                  type="text"
                  placeholder="输入你的需求..."
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all"
                  value={aiPrompt}
                  onChange={(e) => setAIPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSubmit()}
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onSubmit}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 transition-all"
                >
                  <Send size={18} />
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AIAssistantModal;
