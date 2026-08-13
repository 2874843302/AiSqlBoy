import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Search, Table2, ChevronLeft, ChevronRight, ChevronDown, Database, Inbox, Sparkles, X,
  ArrowUp, ArrowDown, Download
} from 'lucide-react';
import TextDetailModal, { type TextDetailData } from '../table/TextDetailModal';

/** AI 查询结果视图：原样展示某次 execute_sql 返回的行列 */
export interface AiResultView {
  /** 每次递增，触发视图切换 */
  seq: number;
  /** 标题（解析出的表名或"查询结果"） */
  title: string;
  columns: string[];
  rows: any[];
}

type AgentTableBrowserProps = {
  /** 当前数据库名 */
  databaseName: string | null;
  /** 当前库的表列表（与 Agent 输入区选择器共享状态） */
  tables: { name: string }[];
  selectedTable: string | null;
  onSelectTable: (name: string | null) => void;
  /** 外部刷新信号：数值变化时重新拉取当前表数据（Agent 执行完成后自动刷新） */
  refreshKey?: number;
  /** AI 查询结果（点击动作卡「定位数据」时传入） */
  aiResult?: AiResultView | null;
};

const PAGE_SIZE = 100;

/** 单元格渲染：null 斜体占位，对象转 JSON，超长省略 + title 悬浮 */
const renderCell = (v: any) => {
  if (v === null || v === undefined) return <span className="text-slate-300 italic">NULL</span>;
  const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return (
    <span className="block max-w-[420px] truncate" title={text}>
      {text}
    </span>
  );
};

/**
 * Agent 模式右侧数据面板，双视图：
 * - 结果视图：原样展示 AI 查询返回的行列（点击「定位数据」进入）
 * - 表浏览视图：表下拉选择 + 分页浏览 + 手动/自动刷新
 * 单元格双击可预览长文本/JSON
 */
const AgentTableBrowser: React.FC<AgentTableBrowserProps> = ({
  databaseName,
  tables,
  selectedTable,
  onSelectTable,
  refreshKey = 0,
  aiResult = null
}) => {
  const [search, setSearch] = useState('');
  const [showTableDropdown, setShowTableDropdown] = useState(false);
  const [columns, setColumns] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 视图模式：result = 展示 AI 结果；table = 浏览整表
  const [viewMode, setViewMode] = useState<'table' | 'result'>('table');
  // 排序：表视图走服务端 ORDER BY，结果视图客户端排序；第三次点击取消
  const [sort, setSort] = useState<{ col: string; dir: 'ASC' | 'DESC' } | null>(null);
  // 单元格双击预览（长文本 / JSON）
  const [textDetail, setTextDetail] = useState<TextDetailData | null>(null);
  // 轻量 toast（预览弹窗的复制反馈）
  const [miniToast, setMiniToast] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showMiniToast = (msg: string) => {
    setMiniToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setMiniToast(''), 2000);
  };
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);
  // 竞态保护：快速切表时丢弃过期响应
  const fetchSeq = useRef(0);

  const filteredTables = search.trim()
    ? tables.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase()))
    : tables;

  const load = useCallback(async (
    tableName: string,
    pageNum: number,
    sortArg?: { col: string; dir: 'ASC' | 'DESC' } | null
  ) => {
    // 排序一律由调用方显式传入，保持 load 引用稳定（避免触发切表 effect 重置排序）
    const s = sortArg ?? null;
    const seq = ++fetchSeq.current;
    setLoading(true);
    setError('');
    try {
      const [cols, res] = await Promise.all([
        window.electronAPI.getTableColumns(tableName),
        window.electronAPI.getTableData(tableName, PAGE_SIZE, (pageNum - 1) * PAGE_SIZE, s?.col, s?.dir)
      ]);
      if (seq !== fetchSeq.current) return;
      setColumns(cols || []);
      setRows(res?.data || []);
      setTotal(res?.total ?? 0);
    } catch (e: any) {
      if (seq !== fetchSeq.current) return;
      setError(e?.message || '加载表数据失败');
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  // 排序的最新值引用：供不随 sort 重跑的 effect（自动刷新）使用
  const sortRef = useRef<{ col: string; dir: 'ASC' | 'DESC' } | null>(null);
  useEffect(() => {
    sortRef.current = sort;
  }, [sort]);

  // 切表：回到第一页并加载，同时退出结果视图、清除排序
  useEffect(() => {
    setPage(1);
    setViewMode('table');
    setSort(null);
    if (selectedTable) {
      load(selectedTable, 1);
    } else {
      setColumns([]);
      setRows([]);
      setTotal(0);
    }
  }, [selectedTable, load]);

  // Agent 执行完成后自动刷新当前表（仅表浏览视图；refreshKey 由 AgentPanel 递增）
  useEffect(() => {
    if (refreshKey > 0 && selectedTable && viewMode === 'table') load(selectedTable, page, sortRef.current);
    // 仅在 refreshKey 变化时触发，page/selectedTable 变化已有上方 effect 覆盖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // 收到 AI 结果：切换到结果视图
  useEffect(() => {
    if (aiResult) setViewMode('result');
  }, [aiResult?.seq]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const gotoPage = (p: number) => {
    if (!selectedTable || p < 1 || p > totalPages) return;
    setPage(p);
    load(selectedTable, p, sort);
  };

  const showingResult = viewMode === 'result' && !!aiResult;
  const gridColumns: string[] = showingResult
    ? aiResult!.columns
    : columns.map((c) => c.name as string);

  // 列注释：来自表元数据（结果视图下若列名与当前表匹配也能命中）
  const commentOf = (col: string): string => {
    const meta = columns.find((c) => c.name === col);
    return meta?.comment ? String(meta.comment) : '';
  };

  // 点击列头切换排序：ASC → DESC → 取消
  const toggleSort = (col: string) => {
    const next = sort?.col === col
      ? (sort.dir === 'ASC' ? { col, dir: 'DESC' as const } : null)
      : { col, dir: 'ASC' as const };
    setSort(next);
    if (!showingResult && selectedTable) {
      setPage(1);
      load(selectedTable, 1, next);
    }
  };

  // 展示行：结果视图下客户端排序，表视图已由服务端排序
  const displayRows = useMemo(() => {
    if (!showingResult) return rows;
    const base = aiResult?.rows || [];
    if (!sort) return base;
    const copy = [...base];
    copy.sort((a, b) => {
      const av = a[sort.col];
      const bv = b[sort.col];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const an = Number(av);
      const bn = Number(bv);
      const cmp = !Number.isNaN(an) && !Number.isNaN(bn) ? an - bn : String(av).localeCompare(String(bv));
      return sort.dir === 'ASC' ? cmp : -cmp;
    });
    return copy;
  }, [showingResult, rows, aiResult, sort]);

  // 导出当前展示数据为 CSV
  const handleExportCsv = async () => {
    if (displayRows.length === 0 || gridColumns.length === 0) return;
    const defaultName = showingResult
      ? `AI结果_${aiResult!.title}_${Date.now()}.csv`
      : `${selectedTable}_${Date.now()}.csv`;
    const res = await window.electronAPI.saveTableCsv(gridColumns, displayRows, defaultName);
    showMiniToast(res.success ? `已导出${res.filePath ? `：${res.filePath}` : ''}` : (res.error || '导出失败'));
  };

  const openPreview = (row: any, col: string) => {
    const v = row[col];
    if (v === null || v === undefined) return;
    setTextDetail({ content: v, fieldName: col });
  };

  return (
    <div className="w-full h-full flex flex-col bg-white">
      {/* 头部：库名 + 视图状态/操作 */}
      <div className="px-3 py-2.5 border-b border-slate-100 flex items-center gap-2">
        <Database size={13} className="text-indigo-500 shrink-0" />
        <span className="text-xs font-bold text-slate-700 truncate flex-1" title={databaseName || ''}>
          {databaseName || '未选择数据库'}
        </span>
        {showingResult && (
          <>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold shrink-0">
              <Sparkles size={10} />
              AI 结果 · {aiResult!.rows.length} 行
            </span>
            <button
              onClick={() => setViewMode('table')}
              className="px-1.5 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10px] font-bold transition-colors shrink-0"
              title="返回整表浏览"
            >
              看整表
            </button>
          </>
        )}
        {!showingResult && (
          <button
            onClick={() => selectedTable && load(selectedTable, page, sort)}
            disabled={!selectedTable || loading}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600 disabled:opacity-40 transition-colors"
            title="刷新表数据"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
        <button
          onClick={handleExportCsv}
          disabled={displayRows.length === 0}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-emerald-600 disabled:opacity-40 transition-colors"
          title="导出当前数据为 CSV"
        >
          <Download size={13} />
        </button>
      </div>

      {/* 表选择：可搜索下拉框（选择后自动回到表浏览视图） */}
      <div className="relative border-b border-slate-100 shrink-0 px-2.5 py-2">
        <button
          onClick={() => setShowTableDropdown((v) => !v)}
          className="w-full flex items-center gap-1.5 bg-slate-50 border border-slate-200 hover:border-indigo-300 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-600 transition-colors"
        >
          <Table2 size={12} className="text-indigo-500 shrink-0" />
          <span className={`flex-1 min-w-0 truncate text-left ${selectedTable ? '' : 'text-slate-300'}`}>
            {selectedTable || '选择表'}
          </span>
          <ChevronDown
            size={12}
            className={`text-slate-400 shrink-0 transition-transform ${showTableDropdown ? 'rotate-180' : ''}`}
          />
        </button>
        <AnimatePresence>
          {showTableDropdown && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowTableDropdown(false)} />
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute left-2.5 right-2.5 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 overflow-hidden"
              >
                <div className="px-2 py-1.5 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                    <Search size={11} className="text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="搜索表..."
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setShowTableDropdown(false)}
                      className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-slate-300"
                    />
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto custom-scrollbar p-1">
                  {filteredTables.length === 0 ? (
                    <div className="px-2 py-2 text-[11px] text-slate-300">
                      {tables.length === 0 ? '当前库暂无表' : '无匹配的表'}
                    </div>
                  ) : (
                    filteredTables.map((t) => (
                      <button
                        key={t.name}
                        onClick={() => {
                          onSelectTable(t.name);
                          setShowTableDropdown(false);
                          setSearch('');
                        }}
                        className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-left text-[11px] font-medium transition-colors ${
                          selectedTable === t.name
                            ? 'bg-indigo-50 text-indigo-600'
                            : 'text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <Table2 size={11} className="shrink-0" />
                        <span className="truncate">{t.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* 数据网格（结果视图 / 表浏览视图共用） */}
      <div className="flex-1 overflow-auto custom-scrollbar min-h-0">
        {showingResult && aiResult!.rows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-300">
            <Inbox size={28} />
            <p className="text-[11px]">该查询结果为空</p>
          </div>
        ) : !showingResult && !selectedTable ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-300">
            <Inbox size={28} />
            <p className="text-[11px]">选择一张表查看数据</p>
          </div>
        ) : !showingResult && error ? (
          <div className="p-4 text-[11px] text-red-500">{error}</div>
        ) : !showingResult && rows.length === 0 && !loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-300">
            <Inbox size={28} />
            <p className="text-[11px]">该表没有数据</p>
          </div>
        ) : (
          <table className="text-[11px] border-separate border-spacing-0 w-full min-w-max">
            <thead className="sticky top-0 z-10">
              <tr>
                {gridColumns.map((col) => (
                  <th
                    key={col}
                    onClick={() => toggleSort(col)}
                    title={`${commentOf(col) || col}（点击排序）`}
                    className={`border-b border-slate-200 px-3 py-2 text-left font-bold whitespace-nowrap cursor-pointer hover:bg-slate-100/60 transition-colors ${
                      commentOf(col) ? 'cursor-help' : ''
                    } ${showingResult ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-500'}`}
                  >
                    {col}
                    {sort?.col === col && (
                      sort.dir === 'ASC'
                        ? <ArrowUp size={10} className="inline ml-1" />
                        : <ArrowDown size={10} className="inline ml-1" />
                    )}
                    {commentOf(col) && (
                      <div className="text-[9px] font-normal text-slate-400 max-w-[160px] truncate">
                        {commentOf(col)}
                      </div>
                    )}
                    {!showingResult && !commentOf(col) && (
                      <div className="text-[9px] font-normal text-slate-300">
                        {(columns.find((c) => c.name === col) || {}).type}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, ri) => (
                <tr key={ri} className="hover:bg-indigo-50/30 transition-colors">
                  {gridColumns.map((col) => (
                    <td
                      key={col}
                      onDoubleClick={() => openPreview(row, col)}
                      className="border-b border-slate-100 px-3 py-1.5 text-slate-600 whitespace-nowrap cursor-default"
                    >
                      {renderCell(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页（仅表浏览视图） */}
      {!showingResult && selectedTable && (
        <div className="px-3 py-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span>{loading ? '加载中...' : `共 ${total} 行`}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => gotoPage(page - 1)}
              disabled={page <= 1 || loading}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={12} />
            </button>
            <span className="font-medium text-slate-500">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => gotoPage(page + 1)}
              disabled={page >= totalPages || loading}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* 单元格内容预览（长文本 / JSON），复用普通模式的预览弹窗 */}
      {textDetail && (
        <TextDetailModal
          detail={textDetail}
          onClose={() => setTextDetail(null)}
          onToast={(t) => showMiniToast(t.message)}
        />
      )}

      {/* 轻量 toast（复制反馈） */}
      {miniToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[210] px-4 py-2 rounded-xl bg-slate-900/85 text-white text-xs font-medium shadow-xl pointer-events-none">
          {miniToast}
        </div>
      )}
    </div>
  );
};

export default AgentTableBrowser;
