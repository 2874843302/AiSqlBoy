import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Table, Play, Plus, Trash2, X, Server, HardDrive, RefreshCw, ChevronRight, Layout, Settings, Activity, AlignLeft, Bot, Sparkles, Send, Loader2, Key, Search, ArrowUp, ArrowDown, FileJson, Save, Terminal, Download, CheckCircle2, Filter, Star, Copy, Rows3, Rows4 } from 'lucide-react';
import { getTimeInputType, isBooleanType, formatTimeForInput, sanitizeDisplayText, formatRedisValue } from '../../utils/valueFormat';
import { isJsonLike, escapeRegExp, formatJson, renderJsonSyntax } from '../../utils/jsonText';
import { highlightSqlForDisplay } from '../../utils/sqlText';

/** 表头类型简写：去掉冗长后缀（完整类型仍在悬浮 title 中展示） */
const shortType = (t: string): string =>
  String(t || '')
    .replace(/\s*without time zone$/i, '')
    .replace(/\s*with time zone$/i, ' tz')
    .replace(/^character varying/i, 'varchar')
    .replace(/^double precision/i, 'double');
import OverflowPreviewText from '../common/OverflowPreviewText';
import TableInspectorPanel from './TableInspector';

const TableView: React.FC<Record<string, any>> = (props) => {
  const {
    activeConnection,
    activeFilterCol,
    activeSearchRegex,
    activeSearchTerm,
    activeSearchTermLower,
    columnFilters,
    columns,
    currentMatchIdx,
    currentPage,
    data,
    deletedRows,
    editingCellCoord,
    editingCells,
    editValue,
    filteredData,
    filterPopoverPos,
    handleCancelChanges,
    handleCellDoubleClick,
    handleCellEditCommit,
    handleContainerScroll,
    handleCopyInspectorSql,
    handleScrollToBottom,
    handleScrollToTop,
    handleSelectTable,
    handleSort,
    handleSubmitChanges,
    hasActiveFilters,
    insertingRow,
    loading,
    loadTableInspector,
    pageSize,
    resetAllTableColumnWidths,
    ROW_HEIGHT,
    density,
    onDensityChange,
    gridMetrics,
    aiDict,
    generatingDict,
    onGenerateDict,
    searchMatches,
    selectedTable,
    setActiveFilterCol,
    setColumnFilters,
    setContextMenu,
    setEditingCellCoord,
    setEditValue,
    setFilterPopoverPos,
    setInsertingRow,
    setIsResizingTableInspector,
    setPageSize,
    setTableInspector,
    setTextDetail,
    showScrollButtons,
    sortConfig,
    startColumnResize,
    TABLE_COL_MAX_WIDTH,
    tableColumnWidths,
    tableContainerRef,
    tableExecutionTime,
    tableInspector,
    tableInspectorWidth,
    tableScrollTop,
    tableViewportHeight,
    totalPages,
    totalRows,
    useVirtualScroll
  } = props;

  // 密度联动的单元格内边距/字号（滑杆实时调节）
  const padStyle = {
    paddingTop: gridMetrics.padY,
    paddingBottom: gridMetrics.padY,
    paddingLeft: gridMetrics.padX,
    paddingRight: gridMetrics.padX
  };
  return (
              <div
                key={selectedTable}
                className="flex-1 flex flex-col relative overflow-hidden"
              >
                {!tableInspector.open && (
                  <button
                    onClick={() => selectedTable && void loadTableInspector(selectedTable)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-8 h-16 rounded-l-xl border border-r-0 border-slate-200 bg-white/95 hover:bg-white text-slate-400 hover:text-blue-600 shadow-md transition-all flex items-center justify-center"
                    title="展开表信息"
                  >
                    <ChevronRight size={16} className="rotate-180" />
                  </button>
                )}
                <div
                  className="flex-1 min-h-0 flex flex-col relative transition-all"
                  style={tableInspector.open ? { paddingRight: tableInspectorWidth + 40 } : undefined}
                >
                <div className="flex-1 min-h-0 flex flex-col p-8 pb-4">
                  {Object.keys(tableColumnWidths).length > 0 && (
                    <div className="mb-3 flex items-center justify-between">
                      <div />
                      <div className="flex items-center gap-2">
                        {hasActiveFilters && (
                          <button
                            onClick={() => setColumnFilters({})}
                            className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 hover:border-blue-300 transition-colors shadow-sm flex items-center gap-1.5"
                            title="清除所有列筛选"
                          >
                            <Filter size={11} />
                            清除筛选
                            <span className="bg-blue-200 text-blue-700 rounded-full px-1.5 text-[9px] leading-none py-0.5">
                              {Object.values(columnFilters).filter((v: any) => v && v.trim()).length}
                            </span>
                          </button>
                        )}
                        {Object.keys(tableColumnWidths).length > 0 && (
                          <button
                            onClick={resetAllTableColumnWidths}
                            className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-colors shadow-sm"
                            title="恢复默认列宽"
                          >
                            恢复默认列宽
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-2xl shadow-slate-200/50 backdrop-blur-sm relative flex-1 min-h-0 flex flex-col">
                    <div
                      className="flex-1 overflow-auto table-scrollbar"
                      ref={tableContainerRef}
                      onScroll={(e) => handleContainerScroll(e, 'table')}
                    >
                      <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                          {columns.map((col) => {
                            const colWidth = tableColumnWidths[col.name];
                            const filterVal = columnFilters[col.name] || '';
                            const isFilterActive = !!filterVal;
                            const isFilterOpen = activeFilterCol === col.name;
                            return (
                            <th
                              key={col.name}
                              className="sticky top-0 z-20 bg-slate-50 border-b border-slate-100 text-left cursor-pointer hover:bg-slate-100 transition-colors group/th"
                              onClick={() => handleSort(col.name)}
                              title={`${col.name} ${col.type}${col.comment ? ` — ${col.comment}` : ''}${aiDict?.columns?.[col.name] ? ` | AI：${aiDict.columns[col.name]}` : ''}`}
                              style={
                                colWidth
                                  ? { ...padStyle, width: colWidth, minWidth: colWidth, maxWidth: colWidth }
                                  : { ...padStyle, maxWidth: TABLE_COL_MAX_WIDTH }
                              }
                            >
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate min-w-0">{shortType(col.type)}</span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {/* Filter toggle button */}
                                    <button
                                      data-filter-toggle
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isFilterOpen) {
                                          setActiveFilterCol(null);
                                        } else {
                                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                          setFilterPopoverPos({ top: rect.bottom + 4, left: rect.left });
                                          setActiveFilterCol(col.name);
                                        }
                                      }}
                                      className={`p-0.5 rounded transition-all ${
                                        isFilterActive
                                          ? 'text-blue-500 opacity-100'
                                          : isFilterOpen
                                            ? 'text-blue-500 opacity-100'
                                            : 'text-slate-300 opacity-0 group-hover/th:opacity-100'
                                      } hover:bg-blue-100/60`}
                                      title="筛选此列"
                                    >
                                      <Filter size={11} fill={isFilterActive ? 'currentColor' : 'none'} />
                                    </button>
                                    <div className={`transition-all duration-300 ${sortConfig.column === col.name ? 'opacity-100' : 'opacity-0 group-hover/th:opacity-30'}`}>
                                      {sortConfig.column === col.name && sortConfig.direction === 'ASC' && <ChevronRight size={12} className="-rotate-90 text-blue-500" />}
                                      {sortConfig.column === col.name && sortConfig.direction === 'DESC' && <ChevronRight size={12} className="rotate-90 text-blue-500" />}
                                      {sortConfig.column !== col.name && <RefreshCw size={10} className="text-slate-400" />}
                                    </div>
                                  </div>
                                </div>
                                <span className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5 min-w-0">
                                  <span className="truncate">{col.name}</span>
                                  {col.primaryKey && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-extrabold tracking-wide leading-none shadow-sm shrink-0">PK</span>
                                  )}
                                  {isFilterActive && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-600 text-[9px] font-bold leading-none shrink-0">
                                      <Filter size={8} fill="currentColor" />
                                      {filterVal.length > 8 ? filterVal.slice(0, 8) + '…' : filterVal}
                                    </span>
                                  )}
                                </span>
                                {aiDict?.columns?.[col.name] && (
                                  <div className="text-[9px] font-normal text-indigo-400 truncate">{aiDict.columns[col.name]}</div>
                                )}
                              </div>

                              {/* Filter popover */}
                              {isFilterOpen && createPortal(
                                <motion.div
                                  data-filter-popover
                                  initial={{ opacity: 0, y: -4, scale: 0.96 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  transition={{ duration: 0.15 }}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    position: 'fixed',
                                    top: `${filterPopoverPos?.top ?? 0}px`,
                                    left: `${filterPopoverPos?.left ?? 0}px`,
                                    zIndex: 9999,
                                  }}
                                  className="w-52 bg-white rounded-xl border border-slate-200 shadow-2xl shadow-slate-300/40 p-3"
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                      <Filter size={12} className="text-blue-500 flex-shrink-0" />
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">筛选 {col.name}</span>
                                    </div>
                                    <div className="relative">
                                      <input
                                        autoFocus
                                        type="text"
                                        value={filterVal}
                                        onChange={(e) =>
                                          setColumnFilters((prev) => {
                                            const next = { ...prev };
                                            if (e.target.value) {
                                              next[col.name] = e.target.value;
                                            } else {
                                              delete next[col.name];
                                            }
                                            return next;
                                          })
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === 'Escape') setActiveFilterCol(null);
                                          if (e.key === 'Enter') setActiveFilterCol(null);
                                        }}
                                        placeholder="输入筛选文本…"
                                        className={`w-full text-xs font-medium pl-3 pr-7 py-2 rounded-lg border outline-none transition-all ${
                                          isFilterActive
                                            ? 'border-blue-300 bg-blue-50/50 text-blue-700 focus:ring-2 focus:ring-blue-500/20'
                                            : 'border-slate-200 bg-white text-slate-600 placeholder:text-slate-300 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10'
                                        }`}
                                      />
                                      {isFilterActive && (
                                        <button
                                          onClick={() => {
                                            setColumnFilters((prev) => {
                                              const next = { ...prev };
                                              delete next[col.name];
                                              return next;
                                            });
                                          }}
                                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                          <X size={13} />
                                        </button>
                                      )}
                                    </div>
                                    {isFilterActive && (
                                      <div className="flex items-center justify-between mt-2">
                                        <span className="text-[10px] text-slate-400">匹配 {filteredData.length} 条</span>
                                        <button
                                          onClick={() => {
                                            setColumnFilters((prev) => {
                                              const next = { ...prev };
                                              delete next[col.name];
                                              return next;
                                            });
                                            setActiveFilterCol(null);
                                          }}
                                          className="text-[10px] font-bold text-blue-500 hover:text-blue-600 transition-colors"
                                        >
                                          清除
                                        </button>
                                      </div>
                                    )}
                                </motion.div>
                              , document.body)}

                              <span
                                className="absolute top-0 right-0 h-full w-2 cursor-col-resize group-hover/th:bg-blue-200/70"
                                onMouseDown={(e) => startColumnResize(e, 'table', col.name, colWidth)}
                                title="拖拽调整列宽"
                              />
                            </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {(() => {
                          // 混合渲染：≤500 行全量进 DOM（content-visibility 跳过屏外渲染，原生搜索/打印可用）；>500 行窗口化虚拟滚动
                          const shouldVirtualize = useVirtualScroll && filteredData.length > 500;
                          const visibleRowsCount = Math.max(1, Math.ceil((tableViewportHeight || ROW_HEIGHT * 10) / ROW_HEIGHT));
                          const overscanRows = 5; // 上下各预渲染 5 行
                          const startIdx = shouldVirtualize ? Math.max(0, Math.floor(tableScrollTop / ROW_HEIGHT) - overscanRows) : 0;
                          const endIdx = shouldVirtualize
                            ? Math.min(filteredData.length, Math.floor((tableScrollTop + (tableViewportHeight || 0)) / ROW_HEIGHT) + overscanRows)
                            : filteredData.length;
                          const visibleRows = filteredData.slice(startIdx, endIdx);
                          const paddingTop = shouldVirtualize ? startIdx * ROW_HEIGHT : 0;
                          const paddingBottom = shouldVirtualize ? Math.max(0, (filteredData.length - endIdx) * ROW_HEIGHT) : 0;

                          return (
                            <>
                              {insertingRow && activeConnection?.type !== 'redis' && !activeConnection?.readOnly && (
                                <tr className="bg-emerald-50/70 border-b border-emerald-100">
                                  {columns.map((col) => (
                                    <td
                                      key={`insert-${col.name}`}
                                      className="px-6 py-3 text-sm text-slate-700 border-x border-transparent"
                                      style={
                                        tableColumnWidths[col.name]
                                          ? { width: tableColumnWidths[col.name], minWidth: tableColumnWidths[col.name], maxWidth: tableColumnWidths[col.name] }
                                          : { maxWidth: TABLE_COL_MAX_WIDTH }
                                      }
                                    >
                                      {col.autoIncrement ? (
                                        <span className="text-[11px] text-slate-400 italic">AUTO</span>
                                      ) : isBooleanType(col.type) ? (
                                        <select
                                          className="w-full bg-white border border-emerald-200 rounded-lg px-2.5 py-1.5 text-[13px] font-mono text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
                                          value={insertingRow[col.name] ?? ''}
                                          onChange={(e) =>
                                            setInsertingRow((prev) => ({ ...(prev || {}), [col.name]: e.target.value }))
                                          }
                                        >
                                          <option value="">{col.nullable ? 'NULL' : '—'}</option>
                                          <option value="true">true</option>
                                          <option value="false">false</option>
                                        </select>
                                      ) : (
                                        <input
                                          type={getTimeInputType(col.type) || 'text'}
                                          value={insertingRow[col.name] ?? ''}
                                          onChange={(e) =>
                                            setInsertingRow((prev) => ({ ...(prev || {}), [col.name]: e.target.value }))
                                          }
                                          placeholder={col.nullable ? 'NULL' : ''}
                                          className="w-full bg-white border border-emerald-200 rounded-lg px-2.5 py-1.5 text-[13px] font-mono text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
                                        />
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              )}
                              {paddingTop > 0 && <tr><td colSpan={columns.length} style={{ height: paddingTop }}></td></tr>}
                              {visibleRows.map((item, i) => {
                                const rowIdx = item.originalIdx;
                                const row = item.row;
                                const isDeleted = deletedRows.has(rowIdx);
                                return (
                                  <tr
                                    key={rowIdx}
                                    className={`group hover:bg-blue-50/40 transition-colors cursor-pointer ${isDeleted ? 'bg-red-50 opacity-60 grayscale-[0.5]' : ''}`}
                                    style={shouldVirtualize ? undefined : { contentVisibility: 'auto', containIntrinsicSize: `auto ${ROW_HEIGHT}px` }}
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      setContextMenu({
                                        x: e.clientX,
                                        y: e.clientY,
                                        type: 'row',
                                        target: rowIdx.toString()
                                      });
                                    }}
                                  >
                                    {columns.map((col) => {
                                      const isEditing = editingCellCoord?.rowIdx === rowIdx && editingCellCoord?.colName === col.name;
                                      const isModified = editingCells[rowIdx]?.[col.name] !== undefined;
                                      const isCurrentMatch = currentMatchIdx >= 0 && searchMatches[currentMatchIdx]?.rowIdx === rowIdx && searchMatches[currentMatchIdx]?.colName === col.name;
                                      const displayValue = isModified ? editingCells[rowIdx][col.name] : row[col.name];
                                      const value = displayValue;
                                      const normalizedText = sanitizeDisplayText(value, col.type);

                                      return (
                                        <td
                                          key={col.name}
                                          data-row-idx={rowIdx}
                                          data-col-name={col.name}
                                          className={`text-slate-600 border-x border-transparent transition-all ${isModified ? 'bg-yellow-50/50 !text-yellow-700' : ''} ${isEditing ? 'ring-2 ring-blue-500 ring-inset z-10 !bg-white' : ''} ${isCurrentMatch ? 'ring-2 ring-orange-400 ring-inset z-10 bg-orange-50' : ''}`}
                                          onDoubleClick={() => {
                                            // Redis 的值不可行内编辑：双击打开预览（JSON 格式化等）
                                            if (activeConnection?.type === 'redis') {
                                              setTextDetail({ content: row[col.name], fieldName: col.name });
                                              return;
                                            }
                                            if (!activeConnection?.readOnly) handleCellDoubleClick(rowIdx, col.name, row[col.name]);
                                          }}
                                          style={{
                                            ...padStyle,
                                            fontSize: gridMetrics.fontPx,
                                            ...(tableColumnWidths[col.name]
                                              ? { width: tableColumnWidths[col.name], minWidth: tableColumnWidths[col.name], maxWidth: tableColumnWidths[col.name] }
                                              : { maxWidth: TABLE_COL_MAX_WIDTH })
                                          }}
                                        >
                                          {isEditing ? (
                                            isBooleanType(col.type) ? (
                                              <select
                                                autoFocus
                                                className="w-full bg-transparent outline-none font-mono text-[13px] text-blue-600"
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onBlur={handleCellEditCommit}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') handleCellEditCommit();
                                                  if (e.key === 'Escape') setEditingCellCoord(null);
                                                }}
                                              >
                                                <option value="">{col.nullable ? 'NULL' : '—'}</option>
                                                <option value="true">true</option>
                                                <option value="false">false</option>
                                              </select>
                                            ) : (
                                              <input
                                                type={getTimeInputType(col.type) || 'text'}
                                                autoFocus
                                                className="w-full bg-transparent outline-none font-mono text-[13px] text-blue-600"
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onBlur={handleCellEditCommit}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') handleCellEditCommit();
                                                  if (e.key === 'Escape') setEditingCellCoord(null);
                                                }}
                                              />
                                            )
                                          ) : (
                                            <>
                                              {value === null ? (
                                                <span className="text-slate-300 italic font-mono text-xs tracking-tighter">NULL</span>
                                              ) : (
                                                <OverflowPreviewText
                                                  text={normalizedText}
                                                  textClassName={`truncate min-w-0 flex-1 group-hover:text-slate-900 transition-colors font-mono text-[13px] ${isModified ? 'font-bold' : ''}`}
                                                  containerClassName="flex items-center gap-3 min-w-0"
                                                  buttonClassName="text-blue-500 hover:text-blue-600 p-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100"
                                                  buttonTitle="查看完整内容"
                                                  buttonSize={10}
                                                  onPreview={() => {
                                                      setTextDetail({ content: value, fieldName: col.name });
                                                    }}
                                                >
                                                    {activeSearchTerm && activeSearchRegex ? (
                                                      (() => {
                                                        const parts = normalizedText.split(activeSearchRegex);
                                                        return parts.map((part, index) =>
                                                          part.toLowerCase() === activeSearchTermLower ? (
                                                            <mark key={index} className="search-hit-mark rounded-sm px-0.5">{part}</mark>
                                                          ) : part
                                                        );
                                                      })()
                                                    ) : normalizedText}
                                                </OverflowPreviewText>
                                              )}
                                            </>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                              {paddingBottom > 0 && <tr><td colSpan={columns.length} style={{ height: paddingBottom }}></td></tr>}
                            </>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* No results after filter */}
                  {data.length > 0 && filteredData.length === 0 && (
                    <div className="p-16 text-center">
                      <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="inline-flex flex-col items-center"
                      >
                        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 border border-blue-100">
                          <Filter size={24} className="text-blue-300" />
                        </div>
                        <h4 className="text-base font-bold text-slate-400 tracking-tight">未匹配到数据</h4>
                        <p className="text-sm text-slate-400 mt-1.5">当前筛选条件下没有数据，请调整或清除筛选</p>
                        <button
                          onClick={() => setColumnFilters({})}
                          className="mt-4 px-4 py-2 text-xs font-bold rounded-lg bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 hover:border-blue-300 transition-colors"
                        >
                          清除所有筛选
                        </button>
                      </motion.div>
                    </div>
                  )}

                  {/* 分页栏已移至滚动区外底部固定，见文件底部固定栏 */}

                  {data.length === 0 && (
                    <div
                      className="p-24 text-center"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          type: 'row',
                          target: '-1'
                        });
                      }}
                    >
                      <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="inline-flex flex-col items-center"
                      >
                        <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6 border border-slate-100 shadow-inner">
                          <Table size={32} className="text-slate-300" />
                        </div>
                        <h4 className="text-lg font-bold text-slate-400 tracking-tight">空表</h4>
                        <p className="text-sm text-slate-500 mt-2">当前表中没有任何数据</p>
                      </motion.div>
                    </div>
                  )}
                </div>
                </div>

                {/* 底部分页栏：固定在滚动区外，任何密度下都无需滚动即可见 */}
                {data.length > 0 && (
                  <div className="shrink-0 px-8 pb-4 pt-2">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/60 px-6 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          共 {totalRows} 条数据
                          {hasActiveFilters && (
                            <span className="ml-1 text-blue-500 normal-case font-bold tracking-normal">
                              · 筛选后 {filteredData.length} 条
                            </span>
                          )}
                        </span>
                        {tableExecutionTime !== null && (
                          <>
                            <div className="h-4 w-px bg-slate-200" />
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                              耗时 {tableExecutionTime < 1000 ? `${tableExecutionTime}ms` : `${(tableExecutionTime / 1000).toFixed(2)}s`}
                            </span>
                          </>
                        )}
                        <div className="h-4 w-px bg-slate-200" />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 font-semibold">每页显示</span>
                          <select
                            value={pageSize}
                            onChange={(e) => {
                              const newSize = Number(e.target.value);
                              setPageSize(newSize);
                              handleSelectTable(selectedTable!, 1, newSize);
                            }}
                            className="bg-white border border-slate-200 rounded-lg text-xs font-bold px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
                          >
                            {[20, 50, 100, 200, 500, 1000].map(size => (
                              <option key={size} value={size}>{size}</option>
                            ))}
                          </select>
                        </div>
                        <div className="h-4 w-px bg-slate-200" />
                        <div className="flex items-center gap-1.5" title="行密度：拖动实时调节（左紧凑 / 右舒适）">
                          <Rows3 size={14} className="text-slate-400 shrink-0" />
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={density}
                            onChange={(e) => onDensityChange(Number(e.target.value))}
                            className="w-20 accent-indigo-600 cursor-pointer"
                          />
                          <Rows4 size={14} className="text-slate-400 shrink-0" />
                        </div>
                        {aiDict?.tableDescription && (
                          <>
                            <div className="h-4 w-px bg-slate-200" />
                            <span
                              className="text-xs text-indigo-500 font-medium max-w-[360px] truncate"
                              title={aiDict.tableDescription}
                            >
                              {aiDict.tableDescription}
                            </span>
                          </>
                        )}
                        {onGenerateDict && (
                          <>
                            <div className="h-4 w-px bg-slate-200" />
                            <button
                              onClick={() => onGenerateDict(selectedTable!)}
                              disabled={generatingDict}
                              className="flex items-center gap-1 text-xs text-slate-500 font-semibold hover:text-indigo-600 transition-colors disabled:opacity-50"
                              title="AI 读取表结构与采样数据，生成表/字段的业务描述"
                            >
                              <Sparkles size={14} className={generatingDict ? 'animate-pulse text-indigo-500' : ''} />
                              {generatingDict ? '生成中' : aiDict ? '重新生成字典' : 'AI 字典'}
                            </button>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          disabled={currentPage === 1 || loading}
                          onClick={() => handleSelectTable(selectedTable!, currentPage - 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronRight size={14} className="rotate-180" />
                        </button>

                        <div className="flex items-center gap-1 px-2">
                          <span className="text-sm font-bold text-blue-600">{currentPage}</span>
                          <span className="text-sm text-slate-400">/</span>
                          <span className="text-sm font-semibold text-slate-500">{totalPages || 1}</span>
                        </div>

                        <button
                          disabled={currentPage === totalPages || totalPages === 0 || loading}
                          onClick={() => handleSelectTable(selectedTable!, currentPage + 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                </div>

              <AnimatePresence>
                {tableInspector.open && (
                  <TableInspectorPanel
                    tableInspector={tableInspector}
                    tableInspectorWidth={tableInspectorWidth}
                    fallbackTableName={selectedTable}
                    onStartResize={() => setIsResizingTableInspector(true)}
                    onClose={() => setTableInspector((prev) => ({ ...prev, open: false }))}
                    onCopySql={handleCopyInspectorSql}
                    onRefresh={() => selectedTable && void loadTableInspector(selectedTable)}
                  />
                )}
              </AnimatePresence>

              {/* 数据编辑浮动操作条 - 移至此处以确保在滚动时保持固定 */}
                <AnimatePresence>
                  {(Object.keys(editingCells).length > 0 || deletedRows.size > 0 || !!insertingRow) && (
                    <motion.div
                      initial={{ y: 50, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 50, opacity: 0 }}
                      className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-6 border border-slate-700"
                    >
                      <div className="flex items-center gap-4 border-r border-slate-700 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-yellow-400 rounded-full" />
                          <span className="text-xs font-bold text-slate-300">
                            {Object.keys(editingCells).length} 项修改
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-red-400 rounded-full" />
                          <span className="text-xs font-bold text-slate-300">
                            {deletedRows.size} 行待删除
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                          <span className="text-xs font-bold text-slate-300">
                            {insertingRow ? '1 行待新增' : '0 行待新增'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleCancelChanges}
                          className="px-4 py-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors"
                        >
                          撤销全部
                        </button>
                        <button
                          onClick={handleSubmitChanges}
                          className="px-6 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
                        >
                          <Send size={14} />
                          提交变更
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 一键回到顶部/底部悬浮按钮 */}
                <AnimatePresence>
                  {showScrollButtons && (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="absolute right-12 bottom-12 z-40 flex flex-col gap-3"
                    >
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleScrollToTop('table')}
                        className="w-10 h-10 bg-white border border-slate-200 rounded-full shadow-xl flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-100 transition-all"
                        title="回到顶部"
                      >
                        <ArrowUp size={18} />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleScrollToBottom('table')}
                        className="w-10 h-10 bg-white border border-slate-200 rounded-full shadow-xl flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-100 transition-all"
                        title="直达底部"
                      >
                        <ArrowDown size={18} />
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
  );
};

export default TableView;
