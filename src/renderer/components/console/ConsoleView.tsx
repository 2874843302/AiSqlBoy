import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-sql';
import { Database, Table, Play, Plus, Trash2, X, Server, HardDrive, RefreshCw, ChevronRight, Layout, Settings, Activity, AlignLeft, Bot, Sparkles, Send, Loader2, Key, Search, ArrowUp, ArrowDown, FileJson, Save, Terminal, Download, CheckCircle2, Filter, Star, Copy } from 'lucide-react';
import { format } from 'sql-formatter';
import { editorStyles } from '../../constants/editorStyles';
import { getTimeInputType, isBooleanType, formatTimeForInput, sanitizeDisplayText, formatRedisValue } from '../../utils/valueFormat';
import { isJsonLike, escapeRegExp, formatJson, renderJsonSyntax } from '../../utils/jsonText';
import { highlightSqlForDisplay } from '../../utils/sqlText';
import OverflowPreviewText from '../common/OverflowPreviewText';

const ConsoleView: React.FC<Record<string, any>> = (props) => {
  const {
    activeConnection,
    activeConsoleId,
    activeSearchRegex,
    activeSearchTerm,
    activeSearchTermLower,
    aiPopupRef,
    aiSelectionLoading,
    aiSelectionPrompt,
    consoles,
    databases,
    handleAISelectionSubmit,
    handleConsoleDBChange,
    handleConsoleTableSelect,
    handleContainerScroll,
    handleEditorKeyDown,
    handleExecuteSQL,
    handleFormatSQL,
    handleLoadMore,
    handleOpenAIModal,
    handleScrollToBottom,
    handleScrollToTop,
    handleSelection,
    insertSuggestion,
    resetAllResultColumnWidths,
    resultColumnWidths,
    resultsContainerRef,
    resultsHeight,
    resultsScrollTop,
    resultsViewportHeight,
    ROW_HEIGHT,
    selectedDatabase,
    selectedSql,
    selectionPosition,
    setAISelectionPrompt,
    setConsoleRenameData,
    setConsoles,
    setIsResizingResults,
    setShowAISelectionInput,
    setShowConsoleRenameModal,
    setSuggestionInfo,
    setTextDetail,
    showAISelectionInput,
    showResultsScrollButtons,
    startColumnResize,
    suggestionInfo,
    suggestionListRef,
    suggestionRef,
    TABLE_COL_MAX_WIDTH,
    tables,
    updateSuggestions
  } = props;
  return (
              <motion.div
                key={activeConsoleId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                {/* SQL Editor Area */}
                <div className="flex-1 flex flex-col p-6 gap-4 overflow-y-auto custom-scrollbar">
                  <div className="min-h-[400px] flex-1 bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${activeConnection?.type === 'redis' ? 'bg-red-500' : 'bg-blue-500'}`} />
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                            {activeConnection?.type === 'redis' ? '命令编辑器' : 'SQL 编辑器'}
                          </span>
                        </div>

                        {/* 数据库选择下拉框 */}
                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
                          {activeConnection?.type === 'redis' ? <Server size={12} className="text-slate-400" /> : <Database size={12} className="text-slate-400" />}
                          <select
                            className="text-xs font-medium text-slate-600 outline-none bg-transparent cursor-pointer"
                            value={consoles.find(c => c.id === activeConsoleId)?.dbName || ''}
                            onChange={(e) => handleConsoleDBChange(activeConsoleId!, e.target.value)}
                          >
                            <option value="">{activeConnection?.type === 'redis' ? '选择 DB' : '选择数据库'}</option>
                            {databases.map(db => (
                              <option key={db} value={db}>{activeConnection?.type === 'redis' ? `DB ${db}` : db}</option>
                            ))}
                          </select>
                        </div>

                        {/* 表选择下拉框（辅助输入） */}
                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
                          {activeConnection?.type === 'redis' ? <Key size={12} className="text-slate-400" /> : <Table size={12} className="text-slate-400" />}
                          <select
                            className="text-xs font-medium text-slate-600 outline-none bg-transparent cursor-pointer"
                            onChange={(e) => {
                              if (e.target.value) {
                                handleConsoleTableSelect(e.target.value);
                                e.target.value = ""; // 重置以便下次选择
                              }
                            }}
                          >
                            <option value="">{activeConnection?.type === 'redis' ? '快速插入 Key' : '快速插入表查询'}</option>
                            {tables.map(table => (
                              <option key={table.name} value={table.name}>{table.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {activeConnection?.type !== 'redis' && (
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleFormatSQL(activeConsoleId!)}
                            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
                            title="格式化 SQL"
                          >
                            <AlignLeft size={14} />
                            格式化
                          </motion.button>
                        )}
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            const tab = consoles.find(c => c.id === activeConsoleId);
                            if (tab) {
                              setConsoleRenameData({ id: tab.id, name: tab.name });
                              setShowConsoleRenameModal(true);
                            }
                          }}
                          className={`px-4 py-2 ${consoles.find(c => c.id === activeConsoleId)?.isDirty ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-400 border-slate-200'} border rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-2`}
                          title="保存控制台 (Ctrl+S)"
                        >
                          <Save size={14} className={consoles.find(c => c.id === activeConsoleId)?.isDirty ? 'animate-pulse' : ''} />
                          保存
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            const tab = consoles.find(c => c.id === activeConsoleId);
                            if (tab) {
                              if (tab.tableName) {
                                handleOpenAIModal('table', tab.tableName);
                              } else if (tab.dbName) {
                                handleOpenAIModal('database', tab.dbName);
                              } else if (selectedDatabase) {
                                handleOpenAIModal('database', selectedDatabase);
                              }
                            }
                          }}
                          className="px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-xs font-bold shadow-sm hover:bg-indigo-100 transition-all flex items-center gap-2"
                          title="AI 助手"
                        >
                          <Sparkles size={14} />
                          AI 助手
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          disabled={consoles.find(c => c.id === activeConsoleId)?.executing}
                          onClick={() => handleExecuteSQL(activeConsoleId!)}
                          className={`px-6 py-2 ${activeConnection?.type === 'redis' ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'} disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-lg transition-all flex items-center gap-2`}
                        >
                          {consoles.find(c => c.id === activeConsoleId)?.executing ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                          {activeConnection?.type === 'redis' ? '执行命令' : '执行查询'}
                        </motion.button>
                      </div>
                    </div>
                    <div
                      className="flex-1 overflow-auto custom-scrollbar p-6 sql-editor-container relative"
                      onMouseUp={handleSelection}
                      onKeyUp={handleSelection}
                    >
                      <Editor
                        value={consoles.find(c => c.id === activeConsoleId)?.sql || ''}
                        onValueChange={val => {
                          setConsoles(prev => prev.map(c =>
                            c.id === activeConsoleId ? {
                              ...c,
                              sql: val,
                              isDirty: val !== c.savedSql
                            } : c
                          ));
                          updateSuggestions();
                        }}
                        onKeyDown={handleEditorKeyDown as any}
                        highlight={code => {
                          if (activeConnection?.type === 'redis') {
                            // 简易的 Redis 命令高亮逻辑
                            const redisCommands = [
                              'GET', 'SET', 'DEL', 'EXISTS', 'EXPIRE', 'TTL', 'KEYS', 'SCAN', 'FLUSHDB', 'FLUSHALL',
                              'HGET', 'HSET', 'HDEL', 'HGETALL', 'HKEYS', 'HVALS',
                              'LPUSH', 'RPUSH', 'LPOP', 'RPOP', 'LRANGE', 'LLEN',
                              'SADD', 'SREM', 'SMEMBERS', 'SISMEMBER',
                              'ZADD', 'ZREM', 'ZRANGE', 'ZCARD', 'ZSCORE',
                              'PUBLISH', 'SUBSCRIBE', 'PSUBSCRIBE',
                              'INFO', 'PING', 'SELECT', 'AUTH', 'QUIT', 'CONFIG'
                            ];

                            // 转义正则
                            const escapedCode = code
                              .replace(/&/g, "&amp;")
                              .replace(/</g, "&lt;")
                              .replace(/>/g, "&gt;")
                              .replace(/"/g, "&quot;")
                              .replace(/'/g, "&#039;");

                            // 匹配第一个单词作为命令
                            const parts = escapedCode.split(/(\s+)/);
                            if (parts.length > 0) {
                              const firstWord = parts[0].toUpperCase();
                              if (redisCommands.includes(firstWord)) {
                                parts[0] = `<span class="token redis-command">${parts[0]}</span>`;
                              }
                            }
                            return parts.join('');
                          }
                          return Prism.highlight(code, Prism.languages.sql, 'sql');
                        }}
                        padding={0}
                        className="font-mono text-sm leading-relaxed text-slate-700 outline-none"
                        placeholder={activeConnection?.type === 'redis' ? "在这里输入 Redis 命令 (例如: GET key)..." : "在这里输入 SQL 语句..."}
                        style={{
                          minHeight: '100%',
                          width: '100%',
                        }}
                      />

                      {/* Autocomplete Suggestion List */}
                      <AnimatePresence>
                        {suggestionInfo.show && (
                          <motion.div
                            ref={suggestionRef}
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="absolute z-[100] bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden w-64"
                            style={{
                              left: suggestionInfo.x,
                              top: suggestionInfo.y
                            }}
                          >
                            <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                <Sparkles size={10} /> 智能补全
                              </span>
                              <span className="text-[10px] text-slate-400">↑↓ 选择, Enter 确认</span>
                            </div>
                            <div
                              ref={suggestionListRef}
                              className="max-h-60 overflow-y-auto py-1 custom-scrollbar scroll-smooth"
                            >
                              {suggestionInfo.list.map((item, i) => (
                                <button
                                  key={`${item.kind}-${item.name}-${i}`}
                                  onClick={() => insertSuggestion(item.name)}
                                  onMouseEnter={() => setSuggestionInfo(prev => ({ ...prev, index: i }))}
                                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between group transition-colors ${
                                    suggestionInfo.index === i ? 'bg-blue-600 text-white' : 'hover:bg-blue-50 text-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    {item.kind === 'keyword' ? (
                                      <Sparkles size={14} className={suggestionInfo.index === i ? 'text-blue-200' : 'text-indigo-400'} />
                                    ) : (
                                      <Table size={14} className={suggestionInfo.index === i ? 'text-blue-200' : 'text-slate-400'} />
                                    )}
                                    <span className="font-mono">{item.name}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                      suggestionInfo.index === i
                                        ? 'bg-blue-500 text-white border-blue-400'
                                        : 'bg-slate-100 text-slate-500 border-slate-200'
                                    }`}>
                                      {item.kind === 'keyword' ? 'SQL' : 'TABLE'}
                                    </span>
                                    {suggestionInfo.index === i && (
                                      <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded border border-blue-400">TAB</span>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* AI Selection Floating Button */}
                      <AnimatePresence>
                        {selectedSql && selectionPosition && !showAISelectionInput && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{
                              opacity: 1,
                              scale: 1,
                              left: selectionPosition.x - 10,
                              top: selectionPosition.y + 25 // 紧挨着首字符下方，且稍微往左移一点避免遮挡
                            }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="absolute z-20"
                          >
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => setShowAISelectionInput(true)}
                              className="w-8 h-8 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-700 transition-colors"
                              title="使用 AI 修改选中的 SQL"
                            >
                              <Sparkles size={16} />
                            </motion.button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* AI Selection Input Box */}
                      <AnimatePresence>
                        {showAISelectionInput && selectionPosition && (
                          <motion.div
                            ref={aiPopupRef}
                            drag
                            dragMomentum={false}
                            initial={{ opacity: 0, scale: 0.9, y: -10 }}
                            animate={{
                              opacity: 1,
                              scale: 1,
                              y: 0,
                              left: Math.max(10, Math.min(selectionPosition.x - 160, 400)),
                              top: selectionPosition.y + 30
                            }}
                            exit={{ opacity: 0, scale: 0.9, y: -10 }}
                            className="absolute z-30 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden cursor-default"
                          >
                            <div className="p-4 flex flex-col gap-3 ai-selection-input">
                              <div className="flex items-center justify-between cursor-move select-none border-b border-slate-50 pb-2 mb-1">
                                <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                                  <div className="flex flex-col gap-0.5 mr-1">
                                    <div className="w-3 h-0.5 bg-slate-300 rounded-full" />
                                    <div className="w-3 h-0.5 bg-slate-300 rounded-full" />
                                    <div className="w-3 h-0.5 bg-slate-300 rounded-full" />
                                  </div>
                                  <Bot size={14} className="text-indigo-600" />
                                  AI 智能修改
                                </span>
                                <button
                                  onClick={() => setShowAISelectionInput(false)}
                                  className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              <div className="relative">
                                <textarea
                                  autoFocus
                                  value={aiSelectionPrompt}
                                  onChange={(e) => setAISelectionPrompt(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      handleAISelectionSubmit();
                                    }
                                  }}
                                  placeholder="输入修改指令，例如：'添加 WHERE 子句' 或 '格式化这段 SQL'..."
                                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-black focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none !text-black !-webkit-text-fill-color-black"
                                  style={{ WebkitTextFillColor: '#000' }}
                                  rows={3}
                                />
                                {aiSelectionLoading && (
                                  <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center rounded-xl">
                                    <Loader2 size={20} className="animate-spin text-indigo-600" />
                                  </div>
                                )}
                              </div>
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => setShowAISelectionInput(false)}
                                  className="px-3 py-1.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                  取消
                                </button>
                                <button
                                  disabled={!aiSelectionPrompt.trim() || aiSelectionLoading}
                                  onClick={handleAISelectionSubmit}
                                  className="px-4 py-1.5 bg-indigo-600 text-white text-[10px] font-bold rounded-lg shadow-md shadow-indigo-600/20 hover:bg-indigo-700 disabled:bg-slate-300 transition-all flex items-center gap-2"
                                >
                                  {aiSelectionLoading ? '处理中...' : '提交指令'}
                                  <Send size={12} />
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Results Area */}
                  <div
                    style={{ height: resultsHeight }}
                    className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col relative shrink-0"
                  >
                    <div
                      className="absolute top-0 left-0 w-full h-1 cursor-row-resize hover:bg-blue-500/20 active:bg-blue-500/40 z-30 transition-colors"
                      onMouseDown={() => setIsResizingResults(true)}
                    />
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">查询结果</span>
                        {activeConsoleId && (
                          <div className="flex items-center gap-2">
                            {consoles.find(c => c.id === activeConsoleId)?.results && (
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-tight">
                                已加载 {consoles.find(c => c.id === activeConsoleId)?.results?.length} 条
                              </span>
                            )}
                            {consoles.find(c => c.id === activeConsoleId)?.isAutoLimited && (
                              <span className="text-[10px] font-bold text-amber-500 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full uppercase tracking-tight flex items-center gap-1">
                                <Activity size={10} /> 自动限制 (MAX 10,000)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {activeConsoleId && Object.keys(resultColumnWidths).some((k) => k.startsWith(`${activeConsoleId}::`)) && (
                          <button
                            onClick={() => resetAllResultColumnWidths(activeConsoleId)}
                            className="text-[10px] font-bold text-slate-500 hover:text-blue-600 bg-white border border-slate-200 hover:border-blue-200 hover:bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest transition-colors"
                            title="恢复当前结果表的默认列宽"
                          >
                            恢复默认列宽
                          </button>
                        )}
                        {activeConsoleId && consoles.find(c => c.id === activeConsoleId)?.hasMore && (
                          <button
                            onClick={() => handleLoadMore(activeConsoleId)}
                            className="text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-full uppercase tracking-widest transition-colors flex items-center gap-1.5"
                          >
                            <Plus size={12} /> 加载更多数据
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 relative overflow-hidden flex flex-col">
                      <div
                        className="flex-1 overflow-auto custom-scrollbar"
                        ref={resultsContainerRef}
                        onScroll={(e) => handleContainerScroll(e, 'results')}
                      >
                        {(() => {
                          const activeConsole = consoles.find(c => c.id === activeConsoleId);
                          if (!activeConsole) return null;

                          if (activeConsole.executing) {
                            return (
                              <div className="h-full flex flex-col items-center justify-center">
                                <div className="relative">
                                  <div className="w-12 h-12 border-4 border-blue-100 rounded-full" />
                                  <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0" />
                                </div>
                                <span className="mt-4 text-slate-400 font-bold text-[10px] uppercase tracking-widest animate-pulse">正在执行查询...</span>
                              </div>
                            );
                          }

                          if (activeConsole.error) {
                            return (
                              <div className="p-8 text-red-500 font-mono text-sm whitespace-pre-wrap">
                                {activeConsole.error}
                              </div>
                            );
                          }
                          if (Array.isArray(activeConsole.results)) {
                            if (activeConsole.results.length === 0) {
                              return (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                  <Activity size={32} className="mb-2 opacity-20" />
                                  <span className="text-xs font-bold uppercase tracking-widest opacity-40">执行成功，无返回结果</span>
                                </div>
                              );
                            }

                            const page = activeConsole.currentPage || 1;
                            const size = activeConsole.pageSize || 50;
                            const results = activeConsole.results || [];

                            // 虚拟列表计算
                            const visibleRowsCount = Math.max(1, Math.ceil((resultsViewportHeight || ROW_HEIGHT * 10) / ROW_HEIGHT));
                            const overscanRows = 5; // 上下各预渲染 5 行
                            const startIdx = Math.max(0, Math.floor(resultsScrollTop / ROW_HEIGHT) - overscanRows);
                            const endIdx = Math.min(results.length, Math.floor((resultsScrollTop + (resultsViewportHeight || 0)) / ROW_HEIGHT) + overscanRows);
                            const visibleResults = results.slice(startIdx, endIdx);
                            const paddingTop = startIdx * ROW_HEIGHT;
                            const paddingBottom = Math.max(0, (results.length - endIdx) * ROW_HEIGHT);

                            return (
                              <div style={{ height: results.length * ROW_HEIGHT || 'auto', minHeight: '100%' }}>
                                <table className="w-full border-collapse table-fixed">
                                  <thead>
                                    <tr className="bg-slate-50 sticky top-0 z-10 h-[48px]">
                                      {activeConsole.columns?.map(col => {
                                        const colKey = `${activeConsoleId ?? 'console'}::${col}`;
                                        const colWidth = resultColumnWidths[colKey];
                                        return (
                                          <th
                                            key={col}
                                            className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 overflow-hidden truncate relative"
                                            style={
                                              colWidth
                                                ? { width: colWidth, minWidth: colWidth, maxWidth: colWidth }
                                                : { maxWidth: TABLE_COL_MAX_WIDTH }
                                            }
                                          >
                                            {col}
                                            <span
                                              className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-blue-200/70"
                                              onMouseDown={(e) => startColumnResize(e, 'results', colKey, colWidth)}
                                              title="拖拽调整列宽"
                                            />
                                          </th>
                                        );
                                      })}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {paddingTop > 0 && <tr><td colSpan={activeConsole.columns?.length} style={{ height: paddingTop }}></td></tr>}
                                    {visibleResults.map((row, i) => {
                                      const actualRowIdx = startIdx + i;
                                      return (
                                        <tr key={actualRowIdx} className="hover:bg-blue-50/30 transition-colors h-[48px]">
                                          {activeConsole.columns?.map(col => {
                                            const rawValue = row[col];
                                            const cellText = sanitizeDisplayText(rawValue);
                                            return (
                                              <td
                                                key={col}
                                                className="px-4 py-3 text-sm text-slate-600 font-mono overflow-hidden truncate"
                                                data-row-idx={actualRowIdx}
                                                data-col-name={col}
                                                onDoubleClick={() => {
                                                  if (rawValue === null || rawValue === undefined) return;
                                                  setTextDetail({ content: rawValue, fieldName: col });
                                                }}
                                                style={
                                                  resultColumnWidths[`${activeConsoleId ?? 'console'}::${col}`]
                                                    ? {
                                                        width: resultColumnWidths[`${activeConsoleId ?? 'console'}::${col}`],
                                                        minWidth: resultColumnWidths[`${activeConsoleId ?? 'console'}::${col}`],
                                                        maxWidth: resultColumnWidths[`${activeConsoleId ?? 'console'}::${col}`]
                                                      }
                                                    : { maxWidth: TABLE_COL_MAX_WIDTH }
                                                }
                                              >
                                                {rawValue === null ? (
                                                  <span className="text-slate-300 italic font-mono text-xs tracking-tighter">NULL</span>
                                                ) : (
                                                  <OverflowPreviewText
                                                    text={cellText}
                                                    textClassName="truncate min-w-0 flex-1 font-mono text-[13px]"
                                                    containerClassName="flex items-center gap-3 overflow-hidden min-w-0"
                                                    buttonClassName="flex-shrink-0 text-blue-500 hover:text-blue-600 p-1 bg-blue-50 hover:bg-blue-100 rounded transition-colors border border-blue-100"
                                                    buttonTitle="查看完整内容（也可双击单元格）"
                                                    buttonSize={8}
                                                    onPreview={() => {
                                                      setTextDetail({ content: rawValue, fieldName: col });
                                                    }}
                                                  >
                                                      {activeSearchTerm && activeSearchRegex ? (
                                                        (() => {
                                                          const parts = cellText.split(activeSearchRegex);
                                                          return parts.map((part, index) =>
                                                            part.toLowerCase() === activeSearchTermLower ? (
                                                              <mark key={index} className="search-hit-mark rounded-sm px-0.5">{part}</mark>
                                                            ) : part
                                                          );
                                                        })()
                                                      ) : (
                                                        cellText
                                                      )}
                                                  </OverflowPreviewText>
                                                )}
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      );
                                    })}
                                    {paddingBottom > 0 && <tr><td colSpan={activeConsole.columns?.length} style={{ height: paddingBottom }}></td></tr>}
                                  </tbody>
                                </table>
                              </div>
                            );
                          }
                          return (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300">
                              <Activity size={32} className="mb-2 opacity-20" />
                              <span className="text-xs font-bold uppercase tracking-widest opacity-40">等待执行...</span>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Console Pagination Controls */}
                      {(() => {
                        const activeConsole = consoles.find(c => c.id === activeConsoleId);
                        if (!activeConsole) return null;

                        // 只要有执行时间、有结果或有错误，就显示状态栏
                        const hasExecutionTime = activeConsole.executionTime !== undefined;
                        const hasResults = Array.isArray(activeConsole.results);
                        const hasError = !!activeConsole.error;

                        if (!hasExecutionTime && !hasResults && !hasError) return null;

                        const total = activeConsole.results?.length || 0;
                        const page = activeConsole.currentPage || 1;
                        const size = activeConsole.pageSize || 50;
                        const totalPages = Math.ceil(total / size);

                        return (
                          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-4">
                              {total > 0 && (
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                  第 {page} / {totalPages} 页 (共 {total} 条)
                                </div>
                              )}
                              {hasExecutionTime && (
                                <>
                                  {total > 0 && <div className="h-3 w-px bg-slate-200" />}
                                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    耗时 {activeConsole.executionTime! < 1000
                                      ? `${activeConsole.executionTime}ms`
                                      : `${(activeConsole.executionTime! / 1000).toFixed(2)}s`}
                                  </div>
                                </>
                              )}
                              {total > 0 && (
                                <>
                                  <div className="h-3 w-px bg-slate-200" />
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">每页</span>
                                    <select
                                      value={size}
                                      onChange={(e) => {
                                        const newSize = Number(e.target.value);
                                        setConsoles(prev => prev.map(c => c.id === activeConsoleId ? { ...c, pageSize: newSize, currentPage: 1 } : c));
                                      }}
                                      className="bg-white border border-slate-200 rounded text-[10px] font-bold px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-500/20 transition-all cursor-pointer text-slate-500"
                                    >
                                      {[20, 50, 100, 200, 500].map(s => (
                                        <option key={s} value={s}>{s}</option>
                                      ))}
                                    </select>
                                  </div>
                                </>
                              )}
                            </div>
                            {totalPages > 1 && (
                              <div className="flex items-center gap-2">
                                <button
                                  disabled={page === 1}
                                  onClick={() => {
                                    setConsoles(prev => prev.map(c => c.id === activeConsoleId ? { ...c, currentPage: page - 1 } : c));
                                  }}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-all"
                                >
                                  <ChevronRight size={12} className="rotate-180" />
                                </button>
                                <button
                                  disabled={page === totalPages}
                                  onClick={() => {
                                    setConsoles(prev => prev.map(c => c.id === activeConsoleId ? { ...c, currentPage: page + 1 } : c));
                                  }}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-all"
                                >
                                  <ChevronRight size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* 查询结果区域的一键回到顶部/底部悬浮按钮 */}
                      <AnimatePresence>
                        {showResultsScrollButtons && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="absolute right-6 bottom-16 z-40 flex flex-col gap-2"
                          >
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleScrollToTop('results')}
                              className="w-8 h-8 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-full shadow-lg flex items-center justify-center text-slate-400 hover:text-blue-600 transition-all"
                              title="回到顶部"
                            >
                              <ArrowUp size={14} />
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleScrollToBottom('results')}
                              className="w-8 h-8 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-full shadow-lg flex items-center justify-center text-slate-400 hover:text-blue-600 transition-all"
                              title="直达底部"
                            >
                              <ArrowDown size={14} />
                            </motion.button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </motion.div>
  );
};

export default ConsoleView;
