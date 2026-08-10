import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, UIEvent as ReactUIEvent } from 'react';
import { ConnectionConfig } from '../../shared/types';
import { getTimeInputType, isBooleanType, formatTimeForInput, formatRedisValue } from '../utils/valueFormat';
import { escapeRegExp } from '../utils/jsonText';

interface UseTableGridOptions {
  activeConnection: ConnectionConfig | null;
  selectedTable: string | null;
  data: any[];
  columns: any[];
  setData: (rows: any[]) => void;
  setToast: (toast: { message: string; type: 'error' | 'success' | 'info' }) => void;
  setLoading: (loading: boolean) => void;
  activeConsoleId: string | null;
  consoles: any[];
  setConsoles: (updater: any) => void;
  resultsHeight: number;
  handleSelectTable: (tableName: string, page?: number, size?: number, sortCol?: string, sortDir?: 'ASC' | 'DESC' | null) => any;
}

export const useTableGrid = ({
  activeConnection,
  selectedTable,
  data,
  columns,
  setData,
  setToast,
  setLoading,
  activeConsoleId,
  consoles,
  setConsoles,
  resultsHeight,
  handleSelectTable
}: UseTableGridOptions) => {
  const [useVirtualScroll] = useState(true); // 是否开启虚拟滚动
  const ROW_HEIGHT = 48; // 预估行高

  // Pagination State
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [tableExecutionTime, setTableExecutionTime] = useState<number | null>(null); // 新增：表格查询耗时

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'ASC' | 'DESC' | null }>({ column: '', direction: null });

  // Column Filter State (per-column text filter for the data table)
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null);
  const [filterPopoverPos, setFilterPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const skipFilterReloadRef = useRef(false);

  const [tableColumnWidths, setTableColumnWidths] = useState<Record<string, number>>({});
  const [resultColumnWidths, setResultColumnWidths] = useState<Record<string, number>>({});
  const [resizingColumn, setResizingColumn] = useState<{
    table: 'table' | 'results';
    key: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  // Data Editing State
  const [editingCells, setEditingCells] = useState<{[rowIdx: number]: {[colName: string]: any}}>({});
  const [deletedRows, setDeletedRows] = useState<Set<number>>(new Set());
  const [editOriginalData, setEditOriginalData] = useState<any[]>([]); // 用于比对变更
  const [editingCellCoord, setEditingCellCoord] = useState<{rowIdx: number, colName: string} | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [insertingRow, setInsertingRow] = useState<Record<string, string> | null>(null);

  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [searchMatches, setSearchMatches] = useState<{rowIdx: number, colName: string}[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  const [resultsScrollTop, setResultsScrollTop] = useState(0);
  const [tableViewportHeight, setTableViewportHeight] = useState(0);
  const [resultsViewportHeight, setResultsViewportHeight] = useState(0);
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const [showResultsScrollButtons, setShowResultsScrollButtons] = useState(false);
  const TABLE_COL_MIN_WIDTH = 120;
  const TABLE_COL_MAX_WIDTH = 420;
  const tableScrollRafRef = useRef<number | null>(null);
  const resultsScrollRafRef = useRef<number | null>(null);
  const pendingTableScrollTopRef = useRef(0);
  const pendingTableViewportRef = useRef(0);
  const pendingResultsScrollTopRef = useRef(0);
  const pendingResultsViewportRef = useRef(0);

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMove = (e: MouseEvent) => {
      const delta = e.clientX - resizingColumn.startX;
      const nextWidth = Math.max(TABLE_COL_MIN_WIDTH, Math.min(TABLE_COL_MAX_WIDTH, resizingColumn.startWidth + delta));
      if (resizingColumn.table === 'table') {
        setTableColumnWidths((prev) => ({ ...prev, [resizingColumn.key]: nextWidth }));
      } else {
        setResultColumnWidths((prev) => ({ ...prev, [resizingColumn.key]: nextWidth }));
      }
    };
    const handleUp = () => setResizingColumn(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingColumn]);

  const startColumnResize = (
    e: ReactMouseEvent,
    table: 'table' | 'results',
    key: string,
    currentWidth?: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn({
      table,
      key,
      startX: e.clientX,
      startWidth: currentWidth ?? 220
    });
  };

  const resetColumnWidth = (table: 'table' | 'results', key: string) => {
    if (table === 'table') {
      setTableColumnWidths((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setResultColumnWidths((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const resetAllTableColumnWidths = () => {
    setTableColumnWidths({});
  };

  const resetAllResultColumnWidths = (consoleId?: string | null) => {
    if (!consoleId) {
      setResultColumnWidths({});
      return;
    }
    const prefix = `${consoleId}::`;
    setResultColumnWidths((prev) => {
      const next: Record<string, number> = {};
      Object.entries(prev).forEach(([k, v]) => {
        if (!k.startsWith(prefix)) next[k] = v;
      });
      return next;
    });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  // 搜索逻辑
  const activeSearchTerm = debouncedSearchTerm.trim();
  const activeSearchTermLower = activeSearchTerm.toLowerCase();
  const activeSearchRegex = useMemo(
    () => (activeSearchTerm ? new RegExp(`(${escapeRegExp(activeSearchTerm)})`, 'gi') : null),
    [activeSearchTerm]
  );

  useEffect(() => {
    if (!activeSearchTerm) {
      setSearchMatches([]);
      setCurrentMatchIdx(-1);
      return;
    }

    const matches: {rowIdx: number, colName: string}[] = [];
    const term = activeSearchTermLower;

    // 根据当前视图选择搜索数据源
    let searchData: any[] = [];
    let searchColumns: any[] = [];

    if (activeConsoleId) {
      const activeConsole = consoles.find((c: any) => c.id === activeConsoleId);
      if (activeConsole && activeConsole.results) {
        searchData = activeConsole.results;
        searchColumns = activeConsole.columns?.map((c: string) => ({ name: c })) || [];
      }
    } else {
      searchData = data;
      searchColumns = columns;
    }

    searchData.forEach((row, rowIdx) => {
      searchColumns.forEach((col) => {
        const value = row[col.name];
        if (value !== null && value !== undefined && value.toString().toLowerCase().includes(term)) {
          matches.push({ rowIdx, colName: col.name });
        }
      });
    });

    setSearchMatches(matches);
    setCurrentMatchIdx(matches.length > 0 ? 0 : -1);
  }, [activeSearchTerm, activeSearchTermLower, data, columns, activeConsoleId, consoles]);

  // 定位到当前匹配项
  useEffect(() => {
    if (currentMatchIdx >= 0 && searchMatches[currentMatchIdx]) {
      const { rowIdx, colName } = searchMatches[currentMatchIdx];

      // 如果是在控制台视图，且匹配项不在当前页，则切换页面
      if (activeConsoleId) {
        const activeConsole = consoles.find((c: any) => c.id === activeConsoleId);
        if (activeConsole && activeConsole.results) {
          const size = activeConsole.pageSize || 50;
          const matchPage = Math.floor(rowIdx / size) + 1;
          if (activeConsole.currentPage !== matchPage) {
            setConsoles((prev: any[]) => prev.map((c: any) => c.id === activeConsoleId ? { ...c, currentPage: matchPage } : c));
            return; // 等待下一轮渲染
          }
        }
      } else if (selectedTable) {
        // 数据浏览模式暂不支持跨页搜索定位（因为数据是按需加载的）
      }

      const element = document.querySelector(`[data-row-idx="${rowIdx}"][data-col-name="${colName}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        // 添加一个临时的闪烁效果
        element.classList.add('search-match-highlight');
        setTimeout(() => element.classList.remove('search-match-highlight'), 2000);
      }
    }
  }, [currentMatchIdx, searchMatches, activeConsoleId]);

  const handleNextMatch = () => {
    if (searchMatches.length > 0) {
      setCurrentMatchIdx((prev) => (prev + 1) % searchMatches.length);
    }
  };

  const handlePrevMatch = () => {
    if (searchMatches.length > 0) {
      setCurrentMatchIdx((prev) => (prev - 1 + searchMatches.length) % searchMatches.length);
    }
  };

  // 处理回到顶部功能
  const handleScrollToTop = (type: 'table' | 'results' = 'table') => {
    const ref = type === 'table' ? tableContainerRef : resultsContainerRef;
    ref.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 处理直达底部功能
  const handleScrollToBottom = (type: 'table' | 'results' = 'table') => {
    const ref = type === 'table' ? tableContainerRef : resultsContainerRef;
    if (ref.current) {
      ref.current.scrollTo({
        top: ref.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // 监听容器滚动事件，控制悬浮按钮的显示与隐藏
  const handleContainerScroll = (e: ReactUIEvent<HTMLDivElement>, type: 'table' | 'results' = 'table') => {
    const target = e.currentTarget;
    if (type === 'table') {
      // 表格视图滚动超过 300px 时显示按钮
      setShowScrollButtons(target.scrollTop > 300);
      pendingTableScrollTopRef.current = target.scrollTop;
      pendingTableViewportRef.current = target.clientHeight;
      if (tableScrollRafRef.current === null) {
        tableScrollRafRef.current = window.requestAnimationFrame(() => {
          setTableScrollTop(pendingTableScrollTopRef.current);
          setTableViewportHeight(pendingTableViewportRef.current);
          tableScrollRafRef.current = null;
        });
      }
    } else {
      // 查询结果视图滚动超过 100px 时显示按钮
      setShowResultsScrollButtons(target.scrollTop > 100);
      pendingResultsScrollTopRef.current = target.scrollTop;
      pendingResultsViewportRef.current = target.clientHeight;
      if (resultsScrollRafRef.current === null) {
        resultsScrollRafRef.current = window.requestAnimationFrame(() => {
          setResultsScrollTop(pendingResultsScrollTopRef.current);
          setResultsViewportHeight(pendingResultsViewportRef.current);
          resultsScrollRafRef.current = null;
        });
      }
    }
  };

  useEffect(() => {
    return () => {
      if (tableScrollRafRef.current !== null) {
        window.cancelAnimationFrame(tableScrollRafRef.current);
      }
      if (resultsScrollRafRef.current !== null) {
        window.cancelAnimationFrame(resultsScrollRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (tableContainerRef.current && tableViewportHeight === 0) {
      setTableViewportHeight(tableContainerRef.current.clientHeight);
    }
    if (resultsContainerRef.current && resultsViewportHeight === 0) {
      setResultsViewportHeight(resultsContainerRef.current.clientHeight);
    }
  }, [selectedTable, activeConsoleId, resultsHeight, tableViewportHeight, resultsViewportHeight]);

  const handleSort = (columnName: string) => {
    let nextDir: 'ASC' | 'DESC' | null = 'ASC';

    if (sortConfig.column === columnName) {
      if (sortConfig.direction === 'ASC') nextDir = 'DESC';
      else if (sortConfig.direction === 'DESC') nextDir = null;
    }

    setSortConfig({ column: nextDir ? columnName : '', direction: nextDir });
    handleSelectTable(selectedTable!, 1, pageSize, nextDir ? columnName : '', nextDir);
  };

  // Handle data cell edit start
  const handleCellDoubleClick = (rowIdx: number, colName: string, value: any) => {
    // Redis 仅支持修改 key, value, ttl，不支持修改 type
    if (activeConnection?.type === 'redis' && colName === 'type') {
      setToast({ message: 'Redis 数据类型由其内容决定，无法直接修改。', type: 'info' });
      return;
    }

    const col = columns.find((c: any) => c.name === colName);
    const timeInputType = col ? getTimeInputType(col.type) : null;

    setEditingCellCoord({ rowIdx, colName });

    if (timeInputType && value) {
      setEditValue(formatTimeForInput(value, timeInputType));
    } else if (col && col.type && isBooleanType(col.type)) {
      // 布尔字段：将 1/true 映射为 "true"，0/false 映射为 "false"，null 映射为空
      if (value === null || value === undefined) {
        setEditValue('');
      } else if (value === true || value === 1 || value === '1' || value === 'true' || value === 'TRUE' || value === 'T') {
        setEditValue('true');
      } else {
        setEditValue('false');
      }
    } else if (value === null || value === undefined) {
      setEditValue('');
    } else if (typeof value === 'object') {
      // 对象/数组使用 JSON.stringify，避免 toString 返回 "[object Object]" 或丢掉方括号
      setEditValue(JSON.stringify(value));
    } else {
      setEditValue(String(value));
    }
  };

  // Handle data cell edit commit (local only)
  const handleCellEditCommit = () => {
    if (!editingCellCoord) return;
    const { rowIdx, colName } = editingCellCoord;

    // 如果输入为空字符串，将其视为 null
    let finalValue: any = editValue === '' ? null : editValue;

    // 处理时间格式转换
    if (finalValue !== null) {
      const col = columns.find((c: any) => c.name === colName);
      const timeInputType = col ? getTimeInputType(col.type) : null;
      if (timeInputType === 'datetime-local') {
        // 转换 '2023-10-27T10:30' 为 '2023-10-27 10:30:00'
        finalValue = finalValue.replace('T', ' ');
        if (finalValue.length === 16) finalValue += ':00'; // 补全秒
      } else if (timeInputType === 'date') {
        // 保持 YYYY-MM-DD
      } else if (timeInputType === 'time') {
        // 补全秒，转换 '10:30' 为 '10:30:00'
        if (finalValue.length === 5) finalValue += ':00';
      }
    }

    // 处理布尔类型：将 "true"/"false" 字符串转为对应的数据库值
    if (finalValue !== null) {
      const col = columns.find((c: any) => c.name === colName);
      if (col && col.type && isBooleanType(col.type)) {
        // MySQL tinyint(1)/bit → 1/0，PostgreSQL boolean → true/false
        if (finalValue === 'true') {
          finalValue = col.type.toUpperCase() === 'BOOLEAN' || col.type.toUpperCase() === 'BOOL' ? true : 1;
        } else if (finalValue === 'false') {
          finalValue = col.type.toUpperCase() === 'BOOLEAN' || col.type.toUpperCase() === 'BOOL' ? false : 0;
        }
      }
    }

    // 检查是否真的有变化
    const originalValue = editOriginalData[rowIdx][colName];

    let isChanged = false;
    if (originalValue === null) {
      isChanged = finalValue !== null;
    } else if (finalValue === null) {
      isChanged = originalValue !== null;
    } else {
      // 将两边统一转为字符串再比较，对象/数组使用 JSON.stringify
      const finalStr = finalValue === null ? '' : (typeof finalValue === 'object' ? JSON.stringify(finalValue) : String(finalValue));
      const origStr = originalValue === null ? '' : (typeof originalValue === 'object' ? JSON.stringify(originalValue) : String(originalValue));
      isChanged = finalStr !== origStr;
    }

    if (isChanged) {
      setEditingCells(prev => ({
        ...prev,
        [rowIdx]: {
          ...(prev[rowIdx] || {}),
          [colName]: finalValue
        }
      }));
    } else {
      // 如果改回原值，从编辑状态中移除
      setEditingCells(prev => {
        const rowEdits = { ...(prev[rowIdx] || {}) };
        delete rowEdits[colName];
        const newEditingCells = { ...prev };
        if (Object.keys(rowEdits).length === 0) {
          delete newEditingCells[rowIdx];
        } else {
          newEditingCells[rowIdx] = rowEdits;
        }
        return newEditingCells;
      });
    }
    setEditingCellCoord(null);
  };

  // Handle row delete (local only)
  const handleLocalRowDelete = (rowIdx: number) => {
    setDeletedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowIdx)) next.delete(rowIdx);
      else next.add(rowIdx);
      return next;
    });
  };

  // Cancel all changes
  const handleCancelChanges = () => {
    setEditingCells({});
    setDeletedRows(new Set());
    setEditingCellCoord(null);
    setInsertingRow(null);
  };

  const formatSqlValue = (val: any) => {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return val;
    // 布尔值：PostgreSQL 用 TRUE/FALSE，其他用 1/0
    if (typeof val === 'boolean') {
      if (activeConnection?.type === 'postgresql') {
        return val ? 'TRUE' : 'FALSE';
      }
      return val ? '1' : '0';
    }
    // 对象/数组使用 JSON.stringify，避免 toString 返回 "[object Object]"
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    return `'${str.replace(/'/g, "''")}'`;
  };

  const normalizeInputValueByColumnType = (input: string, colType?: string): any => {
    const raw = input.trim();
    if (raw === '') return null;
    const t = (colType || '').toUpperCase();
    // 布尔类型："true"/"false" 字符串转对应的数据库值
    if (isBooleanType(t)) {
      if (raw === 'true') return t === 'BOOLEAN' || t === 'BOOL' ? true : 1;
      if (raw === 'false') return t === 'BOOLEAN' || t === 'BOOL' ? false : 0;
    }
    const isNumeric =
      t.includes('INT') || t.includes('DECIMAL') || t.includes('NUMERIC') || t.includes('FLOAT') ||
      t.includes('DOUBLE') || t.includes('REAL') || t.includes('BIT');
    if (isNumeric && /^-?\d+(\.\d+)?$/.test(raw)) {
      return Number(raw);
    }
    return raw;
  };

  const getRowValueByColumn = (row: Record<string, any>, columnName: string) => {
    if (!row) return undefined;
    if (Object.prototype.hasOwnProperty.call(row, columnName)) return row[columnName];
    const key = Object.keys(row).find((k) => k.toLowerCase() === columnName.toLowerCase());
    return key ? row[key] : undefined;
  };

  const buildSqlWhereByColumns = (row: Record<string, any>, cols: string[], quote: string) => {
    return cols.map((col) => {
      const value = getRowValueByColumn(row, col);
      if (value === null || value === undefined) {
        return `${quote}${col}${quote} IS NULL`;
      }
      return `${quote}${col}${quote} = ${formatSqlValue(value)}`;
    }).join(' AND ');
  };

  // Submit all changes to database
  const handleSubmitChanges = async () => {
    if (!selectedTable || !activeConnection) return;

    const sqls: string[] = [];

    if (activeConnection.type === 'redis') {
      // Redis 提交逻辑
      // 1. 处理删除
      for (const rowIdx of Array.from(deletedRows)) {
        const rowData = editOriginalData[rowIdx];
        sqls.push(`DEL ${formatRedisValue(rowData.key)}`);
      }

      // 2. 处理修改
      for (const rowIdxStr in editingCells) {
        const rowIdx = parseInt(rowIdxStr);
        if (deletedRows.has(rowIdx)) continue;

        const rowEdits = editingCells[rowIdx];
        const rowData = editOriginalData[rowIdx];
        const currentKey = rowData.key;

        // A. 处理 Key 重命名
        if (rowEdits.key !== undefined && rowEdits.key !== currentKey) {
          sqls.push(`RENAME ${formatRedisValue(currentKey)} ${formatRedisValue(rowEdits.key)}`);
        }

        const effectiveKey = rowEdits.key !== undefined ? rowEdits.key : currentKey;

        // B. 处理 Value 修改
        if (rowEdits.value !== undefined) {
          sqls.push(`SET ${formatRedisValue(effectiveKey)} ${formatRedisValue(rowEdits.value)}`);
        }

        // C. 处理 TTL 修改
        if (rowEdits.ttl !== undefined) {
          const ttl = parseInt(rowEdits.ttl);
          if (isNaN(ttl)) continue;
          if (ttl === -1) {
            sqls.push(`PERSIST ${formatRedisValue(effectiveKey)}`);
          } else {
            sqls.push(`EXPIRE ${formatRedisValue(effectiveKey)} ${ttl}`);
          }
        }
      }
    } else {
      // SQL 数据库提交逻辑 (MySQL, PostgreSQL, SQLite)
      const quote = activeConnection.type === 'mysql' ? '`' : '"';
      const hasUpdateOrDeleteChanges = deletedRows.size > 0 || Object.keys(editingCells).length > 0;

      // 0. 处理新增行（可视化添加）
      if (insertingRow) {
        const insertableColumns = columns.filter((col: any) => !col.autoIncrement);
        const requiredButEmpty = insertableColumns
          .filter((col: any) => {
            const raw = (insertingRow[col.name] ?? '').trim();
            const hasInput = raw !== '';
            const hasDefault =
              col.defaultValue !== undefined &&
              col.defaultValue !== null &&
              String(col.defaultValue).trim() !== '';
            return !col.nullable && !hasDefault && !hasInput;
          })
          .map((col: any) => col.name);

        if (requiredButEmpty.length > 0) {
          setToast({
            message: `新增失败，以下必填字段不能为空：${requiredButEmpty.join(', ')}`,
            type: 'error'
          });
          return;
        }

        const provided = insertableColumns
          .map((col: any) => ({
            name: col.name,
            value: normalizeInputValueByColumnType(insertingRow[col.name] ?? '', col.type)
          }))
          .filter((item) => item.value !== null);

        if (provided.length > 0) {
          const colsSql = provided.map((item) => `${quote}${item.name}${quote}`).join(', ');
          const valsSql = provided.map((item) => formatSqlValue(item.value)).join(', ');
          sqls.push(`INSERT INTO ${quote}${selectedTable}${quote} (${colsSql}) VALUES (${valsSql})`);
        }
      }

      const primaryKeyCols = columns.filter((c: any) => c.primaryKey).map((c: any) => c.name);
      if (hasUpdateOrDeleteChanges && primaryKeyCols.length === 0) {
        setToast({ message: '无法提交更改：该表没有主键，无法精确定位删除/修改的行。', type: 'error' });
        return;
      }

      // 1. 处理删除
      for (const rowIdx of Array.from(deletedRows)) {
        const rowData = editOriginalData[rowIdx];
        const whereClause = buildSqlWhereByColumns(rowData, primaryKeyCols, quote);
        sqls.push(`DELETE FROM ${quote}${selectedTable}${quote} WHERE ${whereClause}`);
      }

      // 2. 处理修改
      for (const rowIdxStr in editingCells) {
        const rowIdx = parseInt(rowIdxStr);
        if (deletedRows.has(rowIdx)) continue;

        const rowEdits = editingCells[rowIdx];
        const rowData = editOriginalData[rowIdx];
        const setClause = Object.entries(rowEdits).map(([col, val]) => `${quote}${col}${quote} = ${formatSqlValue(val)}`).join(', ');
        const whereClause = buildSqlWhereByColumns(rowData, primaryKeyCols, quote);
        sqls.push(`UPDATE ${quote}${selectedTable}${quote} SET ${setClause} WHERE ${whereClause}`);
      }
    }

    if (sqls.length === 0) {
      setToast({ message: '没有检测到任何变更', type: 'info' });
      return;
    }

    setLoading(true);
    try {
      // 执行所有 SQL
      for (const sql of sqls) {
        const res = await window.electronAPI.executeQuery(sql);
        if (!res.success) throw new Error(res.error || 'SQL 执行失败');
      }

      setToast({ message: `成功提交 ${sqls.length} 项变更`, type: 'success' });
      handleCancelChanges();
      // 刷新数据
      handleSelectTable(selectedTable, currentPage, pageSize);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleStartInsertRow = () => {
    if (!selectedTable || !columns.length || activeConnection?.type === 'redis') return;
    const initial: Record<string, string> = {};
    columns.forEach((col: any) => {
      if (!col.autoIncrement) initial[col.name] = '';
    });
    setInsertingRow(initial);
  };

  const totalPages = Math.ceil(totalRows / pageSize);

  // ---- Column Filter: now handled by backend WHERE clause ----
  const hasActiveFilters = Object.values(columnFilters).some((v) => v && v.trim());

  // 当筛选条件变化时，重新从后端加载数据（带 WHERE 子句）
  useEffect(() => {
    if (!selectedTable) return;
    if (skipFilterReloadRef.current) {
      skipFilterReloadRef.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const offset = 0; // 筛选后回到第一页
        const dataRes = await window.electronAPI.getTableData(
          selectedTable,
          pageSize,
          offset,
          sortConfig.column || undefined,
          sortConfig.direction || undefined,
          columnFilters
        );
        setData(dataRes.data);
        setEditOriginalData(JSON.parse(JSON.stringify(dataRes.data)));
        setEditingCells({});
        setDeletedRows(new Set());
        setTotalRows(dataRes.total);
        setCurrentPage(1);
      } catch (err: any) {
        setToast({ message: err.message, type: 'error' });
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnFilters]);

  // 后端已筛选，前端直接使用 data
  const filteredData = useMemo(() => {
    return data.map((row, idx) => ({ row, originalIdx: idx }));
  }, [data]);

  // Close filter popover when clicking outside
  useEffect(() => {
    if (!activeFilterCol) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-filter-popover]') && !target.closest('[data-filter-toggle]')) {
        setActiveFilterCol(null);
      }
    };
    // delay to avoid the same click that opened it
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [activeFilterCol]);
  // ---------------------------------------------------------------------------

  return {
    useVirtualScroll,
    ROW_HEIGHT,
    pageSize,
    setPageSize,
    currentPage,
    setCurrentPage,
    totalRows,
    setTotalRows,
    tableExecutionTime,
    setTableExecutionTime,
    sortConfig,
    setSortConfig,
    columnFilters,
    setColumnFilters,
    activeFilterCol,
    setActiveFilterCol,
    filterPopoverPos,
    setFilterPopoverPos,
    skipFilterReloadRef,
    tableColumnWidths,
    setTableColumnWidths,
    resultColumnWidths,
    setResultColumnWidths,
    resizingColumn,
    editingCells,
    setEditingCells,
    deletedRows,
    setDeletedRows,
    editOriginalData,
    setEditOriginalData,
    editingCellCoord,
    setEditingCellCoord,
    editValue,
    setEditValue,
    insertingRow,
    setInsertingRow,
    searchTerm,
    setSearchTerm,
    searchMatches,
    currentMatchIdx,
    searchInputRef,
    tableContainerRef,
    resultsContainerRef,
    tableScrollTop,
    resultsScrollTop,
    tableViewportHeight,
    resultsViewportHeight,
    showScrollButtons,
    showResultsScrollButtons,
    TABLE_COL_MIN_WIDTH,
    TABLE_COL_MAX_WIDTH,
    activeSearchTerm,
    activeSearchTermLower,
    activeSearchRegex,
    totalPages,
    hasActiveFilters,
    filteredData,
    startColumnResize,
    resetColumnWidth,
    resetAllTableColumnWidths,
    resetAllResultColumnWidths,
    handleNextMatch,
    handlePrevMatch,
    handleScrollToTop,
    handleScrollToBottom,
    handleContainerScroll,
    handleSort,
    handleCellDoubleClick,
    handleCellEditCommit,
    handleLocalRowDelete,
    handleCancelChanges,
    handleSubmitChanges,
    handleStartInsertRow
  };
};
