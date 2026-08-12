import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Database, Table, Layout, Settings, Loader2, Key, ArrowUp, ArrowDown, Filter } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ConnectionConfig } from '../shared/types'
import {
  AI_VERSION_OPTIONS,
  defaultModelForVendor,
} from '../shared/aiProviderPresets'
import { format } from 'sql-formatter'
import Editor from 'react-simple-code-editor';
import { editorStyles } from './constants/editorStyles';
import ConfirmModal from './components/common/ConfirmModal';
import Toast from './components/common/Toast';
import { useAutoUpdate } from './hooks/useAutoUpdate';
import { useAIAssistant } from './hooks/useAIAssistant';
import { useConsoles } from './hooks/useConsoles';
import { useSqlSelectionAI } from './hooks/useSqlSelectionAI';
import { useAgent } from './hooks/useAgent';
import AIAssistantModal from './components/ai/AIAssistantModal';
import AgentPanel from './components/agent/AgentPanel';
import ERDiagramModal from './components/er/ERDiagramModal';
import ERSchemaDiagramModal from './components/er/ERSchemaDiagramModal';
import { quoteTableNameForQuery, buildFallbackCreateTableSql, stripSqlComments } from './utils/sqlText';
import { classifySql, hasMultipleStatements, stripSqlNoise } from '../shared/sqlSecurity';
import ConsoleRenameModal from './components/console/ConsoleRenameModal';
import LoadConsoleModal from './components/console/LoadConsoleModal';
import ConnectionModal from './components/connection/ConnectionModal';
import ConnectionPackageModal from './components/connection/ConnectionPackageModal';
import SchemaFilterModal from './components/table/SchemaFilterModal';
import RenameTableModal from './components/table/RenameTableModal';
import TextDetailModal from './components/table/TextDetailModal';
import AppContextMenu from './components/common/AppContextMenu';
import SettingsModal from './components/settings/SettingsModal';
import UpdateModal from './components/settings/UpdateModal';
import SchemaEditorModal from './components/table/SchemaEditorModal';
import HeaderBar from './components/layout/HeaderBar';
import ConsoleTabBar from './components/console/ConsoleTabBar';
import Sidebar from './components/layout/Sidebar';
import TableView from './components/table/TableView';
import ConsoleView from './components/console/ConsoleView';
import { useResizableLayout } from './hooks/useResizableLayout';
import { useErDiagram } from './hooks/useErDiagram';
import { useSettings } from './hooks/useSettings';
import { useConnections } from './hooks/useConnections';
import { useTableGrid } from './hooks/useTableGrid';

const App: React.FC = () => {
  // State for connections

  // State for active DB content
  const [databases, setDatabases] = useState<string[]>([])
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null)
  const [tables, setTables] = useState<{ name: string }[]>([])
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [columns, setColumns] = useState<any[]>([])
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);

  // Confirm Modal State
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmOptions, setConfirmOptions] = useState<{
    title: string;
    message: string;
    onConfirm?: () => void;
    type?: 'warning' | 'danger' | 'info';
    buttons?: { label: string; onClick: () => void; variant?: 'primary' | 'secondary' | 'danger' }[];
  }>({
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'warning'
  });

  const confirm = (options: {
    title: string;
    message: string;
    onConfirm?: () => void;
    type?: 'warning' | 'danger' | 'info';
    buttons?: { label: string; onClick: () => void; variant?: 'primary' | 'secondary' | 'danger' }[];
  }) => {
    setConfirmOptions(options);
    setShowConfirm(true);
  };

  const {
    savedConnections, setSavedConnections,
    activeConnection, setActiveConnection,
    connectingConnectionId, setConnectingConnectionId,
    showAddModal, setShowAddModal,
    isEditingConnection, setIsEditingConnection,
    expandedConnections, setExpandedConnections,
    expandedDatabases, setExpandedDatabases,
    newConfig, setNewConfig,
    showSchemaFilterModal, setShowSchemaFilterModal,
    schemaFilterDraft, setSchemaFilterDraft,
    loadSavedConnections,
    getConnectionValidationError,
    handleSaveConnection,
    handleEditConnection,
    handleDeleteConnection,
    handleOpenSchemaFilterModal,
    handleSaveSchemaFilter
  } = useConnections({
    confirm,
    setToast,
    selectedDatabase,
    setDatabases,
    setSelectedDatabase,
    setTables,
    setSelectedTable,
    setData,
    setColumns
  });

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'table' | 'database' | 'row' | 'console', target: string } | null>(null);

  // 只读连接包：导出/导入弹窗
  const [packageModal, setPackageModal] = useState<
    | { mode: 'export'; config: ConnectionConfig; databases: string[]; defaultDatabase?: string }
    | { mode: 'import'; payload: string }
    | null
  >(null);
  const [packageLoading, setPackageLoading] = useState(false);
  const [packageError, setPackageError] = useState('');

  // 表置顶：被置顶的表在左侧列表优先显示
  const [pinnedTables, setPinnedTables] = useState<Set<string>>(new Set());
  const [pendingSqlScriptTarget, setPendingSqlScriptTarget] = useState<{
    scope: 'database' | 'table';
    dbName: string;
    tableName?: string;
  } | null>(null);

  // Modals State
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameData, setRenameData] = useState({ oldName: '', newName: '' });
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const {
    erDiagram, setERDiagram,
    erSchemaDiagram, setErSchemaDiagram,
    erLanguagePickTable, setErLanguagePickTable,
    erSchemaLanguagePickDb, setErSchemaLanguagePickDb,
    handleGenerateERDiagram,
    handleGenerateSchemaERDiagram
  } = useErDiagram({ activeConnection, selectedDatabase, setSelectedDatabase, setToast });
  const [schemaData, setSchemaData] = useState<{ tableName: string; columns: any[]; indexes: any[] }>({ tableName: '', columns: [], indexes: [] });
  const [activeSchemaTab, setActiveSchemaTab] = useState<'columns' | 'indexes'>('columns');
  const [schemaCommentAILoading, setSchemaCommentAILoading] = useState(false);
  const [tableInspector, setTableInspector] = useState<{
    open: boolean;
    loading: boolean;
    tableName: string;
    ddl: string;
    rowCount: number | null;
    columnCount: number;
    indexCount: number;
    error: string;
  }>({
    open: false,
    loading: false,
    tableName: '',
    ddl: '',
    rowCount: null,
    columnCount: 0,
    indexCount: 0,
    error: ''
  });
  const [textDetail, setTextDetail] = useState<{ content: any; fieldName: string } | null>(null)
  const [rowLimit, setRowLimit] = useState(10000); // 新增：大数据量限制行数
  // Layout State
  const {
    sidebarWidth, setSidebarWidth,
    tableInspectorWidth, setTableInspectorWidth,
    resultsHeight, setResultsHeight,
    isResizingSidebar, setIsResizingSidebar,
    isResizingTableInspector, setIsResizingTableInspector,
    isResizingResults, setIsResizingResults
  } = useResizableLayout();
  const {
    showSettings, setShowSettings,
    settingsTab, setSettingsTab,
    apiKey, setApiKey,
    showApiKeyPlain, setShowApiKeyPlain,
    providerVendor, setProviderVendor,
    providerModel, setProviderModel,
    providerApiVersion, setProviderApiVersion,
    uiFontFamily, setUiFontFamily,
    uiThemeMode, setUiThemeMode,
    loadAiSettings,
    loadUiSettings,
    handleSaveSettings
  } = useSettings();

  const [showAISelectionInput, setShowAISelectionInput] = useState(false);
  const aiPopupRef = React.useRef<HTMLDivElement>(null);
  const suggestionRef = React.useRef<HTMLDivElement>(null);
  const suggestionListRef = React.useRef<HTMLDivElement>(null);

  const {
    consoles,
    setConsoles,
    activeConsoleId,
    setActiveConsoleId,
    showConsoleRenameModal,
    setShowConsoleRenameModal,
    consoleRenameData,
    setConsoleRenameData,
    showLoadConsoleModal,
    setShowLoadConsoleModal,
    savedConsoles,
    loadConsoles,
    handleSaveConsole,
    handleCloseConsole,
    handleNewConsole,
    handleDeleteConsole,
    handleRenameConsole,
    handleOpenLoadConsoleModal,
    handleRestoreConsole
  } = useConsoles({
    activeConnection,
    setSelectedTable,
    setContextMenu,
    setToast,
    confirm
  });

  const {
    useVirtualScroll, ROW_HEIGHT,
    pageSize, setPageSize,
    currentPage, setCurrentPage,
    totalRows, setTotalRows,
    tableExecutionTime, setTableExecutionTime,
    sortConfig, setSortConfig,
    columnFilters, setColumnFilters,
    activeFilterCol, setActiveFilterCol,
    filterPopoverPos, setFilterPopoverPos,
    skipFilterReloadRef,
    tableColumnWidths,
    resultColumnWidths,
    resizingColumn,
    editingCells, setEditingCells,
    deletedRows, setDeletedRows,
    editOriginalData, setEditOriginalData,
    editingCellCoord, setEditingCellCoord,
    editValue, setEditValue,
    insertingRow, setInsertingRow,
    searchTerm, setSearchTerm,
    searchMatches, currentMatchIdx,
    searchInputRef, tableContainerRef, resultsContainerRef,
    tableScrollTop, resultsScrollTop,
    tableViewportHeight, resultsViewportHeight,
    showScrollButtons, showResultsScrollButtons,
    TABLE_COL_MAX_WIDTH,
    activeSearchTerm, activeSearchTermLower, activeSearchRegex,
    totalPages, hasActiveFilters, filteredData,
    startColumnResize,
    resetAllTableColumnWidths,
    resetAllResultColumnWidths,
    handleNextMatch, handlePrevMatch,
    handleScrollToTop, handleScrollToBottom,
    handleContainerScroll,
    handleSort,
    handleCellDoubleClick,
    handleCellEditCommit,
    handleLocalRowDelete,
    handleCancelChanges,
    handleSubmitChanges,
    handleStartInsertRow
  } = useTableGrid({
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
    handleSelectTable: (t: string, p?: number, s?: number, c?: string, d?: 'ASC' | 'DESC' | null) => handleSelectTable(t, p, s, c, d)
  });

  const {
    showAIModal,
    setShowAIModal,
    aiLoading,
    aiPrompt,
    setAIPrompt,
    aiMessages,
    aiContext,
    handleOpenAIModal,
    handleAIChat,
    handleApplyAISQL
  } = useAIAssistant({
    activeConnection,
    selectedDatabase,
    activeConsoleId,
    consoles,
    setConsoles,
    setActiveConsoleId,
    setContextMenu,
    setToast
  });

  const {
    selectedSql,
    aiSelectionPrompt,
    setAISelectionPrompt,
    aiSelectionLoading,
    selectionPosition,
    handleSelection,
    handleAISelectionSubmit,
    closeSelectionInput,
    resetSelectionState
  } = useSqlSelectionAI({
    activeConnectionType: activeConnection?.type,
    activeConsoleId,
    consoles,
    setConsoles,
    showAISelectionInput,
    setShowAISelectionInput,
    setToast,
    aiPopupRef
  });

  const {
    showAgentPanel,
    agentLoading,
    agentBusy,
    agentInput,
    setAgentInput,
    agentMessages,
    permissionLevel,
    permissionLocked,
    agentError,
    agentIteration,
    conversationsByConn,
    currentConversationId,
    currentConvConnectionId,
    handleOpenAgent,
    handleCloseAgent,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
    handleAgentSubmit,
    handleCancelAgent,
    handleApproveAction,
    handleRejectAction,
    handleClearSession,
    handlePermissionChange,
  } = useAgent({
    savedConnections,
    activeConnection,
    selectedDatabase,
    selectedTable,
    setToast,
    onConnect: (config) => handleConnect(config),
    onRestoreDbTable: async (db, table) => {
      // 不走 handleSelectDatabase（其折叠切换逻辑会干扰恢复），直接切换库并加载表
      if (!db) {
        setSelectedDatabase(null);
        setTables([]);
        setSelectedTable(null);
        setData([]);
        setColumns([]);
        return;
      }
      try {
        const useRes = await window.electronAPI.useDatabase(db);
        if (!useRes.success) {
          setToast({ message: useRes.error || `恢复数据库 ${db} 失败`, type: 'error' });
          return;
        }
        setSelectedDatabase(db);
        setExpandedDatabases((prev) => new Set(prev).add(db));
        const tableList = await window.electronAPI.getTables();
        setTables(tableList);
        if (table && tableList.some((t) => t.name === table)) {
          await handleSelectTable(table);
        } else {
          setSelectedTable(null);
          setData([]);
          setColumns([]);
        }
      } catch (err: any) {
        setToast({ message: err.message || '恢复库表上下文失败', type: 'error' });
      }
    }
  });

  const {
    appVersion,
    updateStatus,
    showUpdateModal,
    setShowUpdateModal,
    handleCheckUpdates,
    handleDownloadUpdate,
    handleInstallUpdate
  } = useAutoUpdate();

  // Autocomplete State
  const [suggestionInfo, setSuggestionInfo] = useState<{
    show: boolean;
    list: { name: string; kind: 'keyword' | 'table' }[];
    index: number;
    x: number;
    y: number;
    word: string;
    start: number;
  }>({ show: false, list: [], index: 0, x: 0, y: 0, word: '', start: 0 });

  const SQL_KEYWORDS = useMemo(
    () => [
      'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
      'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'ON',
      'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
      'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'TRUNCATE TABLE',
      'CREATE INDEX', 'DROP INDEX', 'PRIMARY KEY', 'FOREIGN KEY',
      'DISTINCT', 'UNION', 'UNION ALL', 'CASE WHEN', 'EXISTS', 'IN', 'LIKE',
      'AND', 'OR', 'NOT', 'IS NULL', 'IS NOT NULL',
      'COUNT', 'SUM', 'AVG', 'MAX', 'MIN'
    ],
    []
  );

  // 自动滚动补全列表，确保选中项可见
  useEffect(() => {
    if (suggestionInfo.show && suggestionListRef.current) {
      const container = suggestionListRef.current;
      const selectedItem = container.children[suggestionInfo.index] as HTMLElement;
      if (selectedItem) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = selectedItem.getBoundingClientRect();

        if (itemRect.bottom > containerRect.bottom) {
          container.scrollTop += (itemRect.bottom - containerRect.bottom);
        } else if (itemRect.top < containerRect.top) {
          container.scrollTop -= (containerRect.top - itemRect.top);
        }
      }
    }
  }, [suggestionInfo.index, suggestionInfo.show]);

  const sqlScriptFileInputRef = React.useRef<HTMLInputElement>(null);
  useEffect(() => {
    setSuggestionInfo(prev => ({ ...prev, show: false }));
  }, [activeConsoleId, activeConnection]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        // textDetail 弹窗打开时，Ctrl+F 由 TextDetailModal 内部的监听处理
        if (textDetail) {
          return;
        }
        if (selectedTable || activeConsoleId) {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        if (activeConsoleId) {
          e.preventDefault();
          handleSaveConsole(activeConsoleId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTable, activeConsoleId, consoles, textDetail]);

  // 点击外部关闭弹窗逻辑
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // AI 智能修改弹窗
      if (showAISelectionInput && aiPopupRef.current && !aiPopupRef.current.contains(event.target as Node)) {
        closeSelectionInput();
      }
      // 自动补全建议列表
      if (suggestionInfo.show && suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setSuggestionInfo(prev => ({ ...prev, show: false }));
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAISelectionInput, suggestionInfo.show]);

  useEffect(() => {
    loadSavedConnections()
    loadAiSettings()
    loadUiSettings()
  }, [])

  useEffect(() => {
     resetSelectionState();
   }, [activeConsoleId]);

  const filteredDatabases = useMemo(() => {
    const selected = activeConnection?.selectedSchemas || [];
    if (!selected.length) return databases;
    const allow = new Set(selected);
    return databases.filter((db) => allow.has(db));
  }, [databases, activeConnection]);

  /** 切换表的置顶状态（非阻塞） */
  const togglePinTable = (tableName: string) => {
    if (!activeConnection?.id) return;
    const next = new Set(pinnedTables);
    if (next.has(tableName)) {
      next.delete(tableName);
    } else {
      next.add(tableName);
    }
    setPinnedTables(next);
    // 异步写入持久化
    window.electronAPI.saveSetting(`pinned_tables_${activeConnection.id}`, JSON.stringify([...next]))
      .catch((err: any) => console.error('保存置顶表失败:', err));
  };

  const loadDatabases = async (forceConfig?: ConnectionConfig) => {
    if (!activeConnection && !forceConfig) return;
    try {
      const dbList = await window.electronAPI.getDatabases();
      setDatabases(dbList);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  }

  /** 从持久化存储中加载当前连接的置顶表列表 */
  const loadPinnedTables = async () => {
    if (!activeConnection?.id) return;
    const raw = await window.electronAPI.getSetting(`pinned_tables_${activeConnection.id}`);
    if (raw) {
      try {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) setPinnedTables(new Set(list));
      } catch { /* ignore */ }
    }
  };

  const handleConnect = async (config: ConnectionConfig) => {
    if (connectingConnectionId !== null) return;
    // 当前连接支持折叠/展开
    if (activeConnection?.id === config.id && expandedConnections.has(config.id!)) {
      const next = new Set(expandedConnections);
      next.delete(config.id!);
      setExpandedConnections(next);
      return;
    }

    setConnectingConnectionId(config.id ?? null);
    setLoading(true)
    const previousActiveConnection = activeConnection;
    const previousDatabases = [...databases];
    const previousSelectedDatabase = selectedDatabase;
    const previousTables = [...tables];
    const previousSelectedTable = selectedTable;
    const previousData = [...data];
    const previousColumns = [...columns];
    const previousExpandedDatabases = new Set(expandedDatabases);
    const previousCurrentPage = currentPage;
    const previousPageSize = pageSize;
    const previousSortConfig = { ...sortConfig };

    const restorePreviousConnectionView = async () => {
      // 无历史连接时，恢复到空白视图
      if (!previousActiveConnection) {
        setActiveConnection(null);
        setDatabases([]);
        setSelectedDatabase(null);
        setTables([]);
        setSelectedTable(null);
        setData([]);
        setColumns([]);
        setExpandedDatabases(new Set());
        return;
      }

      // 先恢复主进程中的真实连接，再恢复前端视图，避免“看起来恢复但后台已断开”
      const reconnect = await window.electronAPI.connectDB(previousActiveConnection);
      if (!reconnect.success) {
        setActiveConnection(previousActiveConnection);
        setDatabases(previousDatabases);
        setSelectedDatabase(previousSelectedDatabase);
        setTables(previousTables);
        setSelectedTable(previousSelectedTable);
        setData(previousData);
        setColumns(previousColumns);
        setExpandedDatabases(previousExpandedDatabases);
        setToast({ message: '回滚到原连接失败，请点击“刷新”重试', type: 'error' });
        return;
      }

      setActiveConnection(previousActiveConnection);
      setExpandedConnections((prev) => {
        const next = new Set(prev);
        next.add(previousActiveConnection.id!);
        return next;
      });

      await loadDatabases(previousActiveConnection);
      setExpandedDatabases(previousExpandedDatabases);

      if (!previousSelectedDatabase) {
        setSelectedDatabase(null);
        setTables([]);
        setSelectedTable(null);
        setData([]);
        setColumns([]);
        return;
      }

      const useRes = await window.electronAPI.useDatabase(previousSelectedDatabase);
      if (!useRes.success) {
        setSelectedDatabase(previousSelectedDatabase);
        setTables(previousTables);
        setSelectedTable(previousSelectedTable);
        setData(previousData);
        setColumns(previousColumns);
        return;
      }

      setSelectedDatabase(previousSelectedDatabase);
      const latestTables = await window.electronAPI.getTables();
      setTables(latestTables);

      if (!previousSelectedTable || !latestTables.some((t) => t.name === previousSelectedTable)) {
        setSelectedTable(null);
        setData([]);
        setColumns([]);
        return;
      }

      await handleSelectTable(
        previousSelectedTable,
        previousCurrentPage,
        previousPageSize,
        previousSortConfig.column,
        previousSortConfig.direction
      );
    };
    try {
      const result = await window.electronAPI.connectDB(config)
      if (result.success) {
        setActiveConnection(config)
        setExpandedConnections((prev) => {
          const next = new Set(prev);
          next.add(config.id!);
          return next;
        });

        // 连接成功后加载数据库列表
        await loadDatabases(config);

        // Load consoles for this connection
        await loadConsoles(config.id);

        // 加载当前连接的置顶表列表
        await loadPinnedTables();

        // 如果配置中已经指定了数据库，则自动选择
        if (config.type === 'sqlite') {
          handleSelectDatabase('main')
        } else if (config.type === 'oracle') {
          // Oracle：database 字段为服务名，schema 从侧栏选择，勿当作 schema 自动切换
          setSelectedDatabase(null)
          setTables([])
        } else if (config.database) {
          handleSelectDatabase(config.database)
        } else {
          setSelectedDatabase(null)
          setTables([])
        }

        setSelectedTable(null)
        setData([])
        setColumns([])
        setColumnFilters({})
      } else {
        await restorePreviousConnectionView();
        setToast({ message: result.error || '连接失败', type: 'error' })
      }
    } catch (err: any) {
      await restorePreviousConnectionView();
      setToast({ message: err.message, type: 'error' })
    } finally {
      setLoading(false)
      setConnectingConnectionId(null);
    }
  }

  const handleSelectDatabase = async (dbName: string) => {
    // 切换折叠状态
    const newExpanded = new Set(expandedDatabases)
    if (newExpanded.has(dbName)) {
      newExpanded.delete(dbName)
      setExpandedDatabases(newExpanded)
      return
    } else {
      newExpanded.add(dbName)
      setExpandedDatabases(newExpanded)
    }

    setSelectedDatabase(dbName)
    setLoading(true)
    try {
      const result = await window.electronAPI.useDatabase(dbName)
      if (result.success) {
        const tableList = await window.electronAPI.getTables()
        setTables(tableList)
        setSelectedTable(null)
        setSortConfig({ column: '', direction: null })
        setColumnFilters({})
        setData([])
        setColumns([])

        // Redis 自动选择 "Keys" 表
        if (activeConnection?.type === 'redis' && tableList.length > 0) {
          handleSelectTable(tableList[0].name)
        }
      } else {
        setToast({ message: result.error || '切换数据库失败', type: 'error' })
      }
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleSelectTable = async (tableName: string, page = 1, size = pageSize, sortCol = sortConfig.column, sortDir = sortConfig.direction) => {
    setSelectedTable(tableName)
    setCurrentPage(page);
    setLoading(true)
    setTableExecutionTime(null);
    skipFilterReloadRef.current = true;
    setColumnFilters({});
    setActiveFilterCol(null);
    try {
      const offset = (page - 1) * size;
      const startTime = Date.now();
      const cols = await window.electronAPI.getTableColumns(tableName);
      const colNames = new Set(cols.map((c: any) => String(c.name)));
      const requestedSortColumn = sortCol ? String(sortCol) : '';
      const isSortColumnValid = requestedSortColumn ? colNames.has(requestedSortColumn) : false;
      const effectiveSortColumn = isSortColumnValid ? requestedSortColumn : '';
      const effectiveSortDir = isSortColumnValid ? sortDir : null;

      if (requestedSortColumn && !isSortColumnValid) {
        setSortConfig({ column: '', direction: null });
      }

      const dataRes = await window.electronAPI.getTableData(
        tableName,
        size,
        offset,
        effectiveSortColumn || undefined,
        effectiveSortDir || undefined,
        {}
      );
      const endTime = Date.now();
      setTableExecutionTime(endTime - startTime);
      setColumns(cols)
      setData(dataRes.data)
      setEditOriginalData(JSON.parse(JSON.stringify(dataRes.data))) // 深拷贝原始数据用于比对
      setEditingCells({})
      setDeletedRows(new Set())
      setTotalRows(dataRes.total)
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const loadTableInspector = async (tableName: string) => {
    setTableInspector((prev) => ({
      ...prev,
      open: true,
      loading: true,
      tableName,
      error: ''
    }));

    try {
      const [cols, idxs] = await Promise.all([
        window.electronAPI.getTableColumns(tableName),
        window.electronAPI.getTableIndexes(tableName)
      ]);

      let rowCount: number | null = null;
      try {
        const countSql = `SELECT COUNT(*) AS total FROM ${quoteTableNameForQuery(tableName, activeConnection?.type)}`;
        const countRes = await window.electronAPI.executeQuery(countSql);
        if (countRes.success && countRes.data && countRes.data[0]) {
          const firstRow = countRes.data[0] as Record<string, any>;
          const raw =
            firstRow.total ??
            firstRow.TOTAL ??
            firstRow['COUNT(*)'] ??
            firstRow.count ??
            Object.values(firstRow)[0];
          const n = Number(raw);
          rowCount = Number.isFinite(n) ? n : null;
        }
      } catch {
        rowCount = null;
      }

      let ddl = '';
      if (activeConnection?.type === 'mysql') {
        const ddlRes = await window.electronAPI.executeQuery(`SHOW CREATE TABLE ${quoteTableNameForQuery(tableName, activeConnection?.type)}`);
        if (ddlRes.success && ddlRes.data?.[0]) {
          const row = ddlRes.data[0] as Record<string, any>;
          ddl = String(row['Create Table'] ?? row['CREATE TABLE'] ?? '');
        }
      }

      if (!ddl) {
        ddl = buildFallbackCreateTableSql(tableName, cols, idxs);
      }

      setTableInspector({
        open: true,
        loading: false,
        tableName,
        ddl,
        rowCount,
        columnCount: cols.length,
        indexCount: idxs.length,
        error: ''
      });
    } catch (err: any) {
      setTableInspector({
        open: true,
        loading: false,
        tableName,
        ddl: '',
        rowCount: null,
        columnCount: 0,
        indexCount: 0,
        error: err?.message || '读取表信息失败'
      });
    }
  };

  useEffect(() => {
    if (!selectedTable) {
      setTableInspector((prev) => ({ ...prev, open: false }));
      return;
    }
    if (tableInspector.open && tableInspector.tableName !== selectedTable) {
      void loadTableInspector(selectedTable);
    }
  }, [selectedTable]);

  const handleLoadMore = async (id: string) => {
    const consoleTab = consoles.find(c => c.id === id);
    if (!consoleTab || consoleTab.executing) return;

    // 简单策略：如果是被自动限制的，建议用户增加 LIMIT。
    // 如果我们要实现点击加载更多，我们需要解析 SQL 并修改 LIMIT/OFFSET。
    // 对于目前的简单版本，我们告知用户如何操作。
    setToast({
      message: '请在 SQL 中手动添加或修改 LIMIT 语句来获取更多数据。例如：LIMIT 10000 OFFSET 10000',
      type: 'info'
    });
  };

  const handleExecuteSQL = async (id: string) => {
    const consoleTab = consoles.find(c => c.id === id);
    if (!consoleTab) return;

    // 获取选中的文本，如果没有选中则执行全部
    let sqlToExecute = '';
    const textarea = document.querySelector('.sql-editor-container textarea') as HTMLTextAreaElement;
    if (textarea && textarea.selectionStart !== textarea.selectionEnd) {
      sqlToExecute = consoleTab.sql.substring(textarea.selectionStart, textarea.selectionEnd);
    } else {
      sqlToExecute = consoleTab.sql;
    }

    // 在执行前清理注释内容
    sqlToExecute = stripSqlComments(sqlToExecute);

    if (!sqlToExecute.trim()) return;

    // 只读模式预检：仅放行单条查询，拦截多语句拼接与 INTO OUTFILE 伪装写入（UI 礼貌层，主进程另有强制层）
    if (activeConnection?.readOnly) {
      if (hasMultipleStatements(sqlToExecute)) {
        setToast({ message: '只读模式下仅允许执行单条查询语句', type: 'error' });
        return;
      }
      if (/\bINTO\s+(OUTFILE|DUMPFILE)\b/i.test(stripSqlNoise(sqlToExecute))) {
        setToast({ message: '只读模式下禁止 SELECT INTO OUTFILE/DUMPFILE', type: 'error' });
        return;
      }
      if (classifySql(sqlToExecute) !== 'SELECT') {
        setToast({ message: '当前连接为只读模式，仅允许执行查询语句', type: 'error' });
        return;
      }
    }

    let startTime = Date.now();
    setConsoles(prev => prev.map(c => c.id === id ? { ...c, executing: true, error: undefined, executionTime: undefined } : c));
    try {
      // 如果控制台指定了数据库且当前未切换到该库，则先切换（限库连接包会拒绝越库切换）
      if (consoleTab.dbName && consoleTab.dbName !== selectedDatabase) {
        const switchRes = await window.electronAPI.useDatabase(consoleTab.dbName);
        if (!switchRes.success) throw new Error(switchRes.error || '切换数据库失败');
        setSelectedDatabase(consoleTab.dbName);
        const tableList = await window.electronAPI.getTables();
        setTables(tableList);
      }

      startTime = Date.now();
      const res = await window.electronAPI.executeQuery(sqlToExecute);
      const endTime = Date.now();
      const duration = endTime - startTime;

      if (res.success) {
        let processedData = res.data;

        // 移除旧的强制截断逻辑，改用主进程返回的 hasMore 状态
        if (res.isAutoLimited && res.hasMore) {
          setToast({
            message: `已自动加载前 10,000 条数据。如果需要查看更多，请手动添加 LIMIT 或点击下方按钮。`,
            type: 'info'
          });
        }

        setConsoles(prev => prev.map(c => c.id === id ? {
          ...c,
          results: processedData,
          columns: res.columns,
          executing: false,
          currentPage: 1,
          executionTime: duration,
          hasMore: res.hasMore,
          isAutoLimited: res.isAutoLimited,
          totalCount: res.totalCount
        } : c));

        // 如果执行的是创建/删除数据库语句，刷新数据库列表
        const upperSql = consoleTab.sql.trim().toUpperCase();
        if (upperSql.includes('CREATE DATABASE') || upperSql.includes('DROP DATABASE')) {
          await loadDatabases();
        }
      } else {
        setConsoles(prev => prev.map(c => c.id === id ? { ...c, error: res.error, executing: false, executionTime: duration } : c));
        setToast({ message: res.error || 'SQL 执行失败', type: 'error' });
      }
    } catch (err: any) {
      const endTime = Date.now();
      const duration = endTime - (startTime || endTime);
      setConsoles(prev => prev.map(c => c.id === id ? { ...c, error: err.message, executing: false, executionTime: duration } : c));
      setToast({ message: err.message, type: 'error' });
    }
  }

  const handleExportDB = async (includeData: boolean) => {
    if (activeConnection?.type === 'redis') {
      setToast({ message: 'Redis 暂不支持导出 SQL', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      const res = await window.electronAPI.exportDatabase(includeData);
      if (res.success) {
        setToast({ message: '数据库导出成功', type: 'success' });
      } else if (res.error !== 'User cancelled') {
        setToast({ message: res.error || '导出失败', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
      setContextMenu(null);
    }
  }

  const handleDeleteDB = async (dbName: string) => {
    const isRedis = activeConnection?.type === 'redis';
    const confirmMsg = isRedis
      ? `确定要清空数据库 DB ${dbName} 吗？此操作将删除该库下所有 Key！`
      : `确定要删除数据库 "${dbName}" 吗？此操作不可撤销！`;

    confirm({
      title: isRedis ? '清空数据库' : '删除数据库',
      message: confirmMsg,
      type: 'danger',
      onConfirm: async () => {
        setLoading(true);
        try {
          const res = await window.electronAPI.deleteDatabase(dbName);
          if (res.success) {
            setToast({ message: isRedis ? `数据库 DB ${dbName} 已清空` : `数据库 ${dbName} 已删除`, type: 'success' });
            await loadDatabases();
          } else {
            setToast({ message: res.error || '操作失败', type: 'error' });
          }
        } catch (err: any) {
          setToast({ message: err.message, type: 'error' });
        } finally {
          setLoading(false);
          setContextMenu(null);
        }
      }
    });
  }

  const handleFormatSQL = (id: string) => {
    const consoleTab = consoles.find(c => c.id === id);
    if (!consoleTab || !consoleTab.sql.trim()) return;

    try {
      const formatted = format(consoleTab.sql, {
        language:
          activeConnection?.type === 'mysql' ? 'mysql' :
          activeConnection?.type === 'postgresql' ? 'postgresql' :
          activeConnection?.type === 'oracle' ? 'plsql' :
          'sql',
        tabWidth: 2,
        keywordCase: 'upper',
      });
      setConsoles(prev => prev.map(c => c.id === id ? { ...c, sql: formatted } : c));
    } catch (err) {
      console.error('SQL Format Error:', err);
    }
  }

  const handleRenameTable = async () => {
    if (!renameData.newName || renameData.newName === renameData.oldName) {
      setShowRenameModal(false);
      return;
    }

    setLoading(true);
    try {
      const result = await window.electronAPI.renameTable(renameData.oldName, renameData.newName);
      if (result.success) {
        const tableList = await window.electronAPI.getTables();
        setTables(tableList);
        if (selectedTable === renameData.oldName) {
          setSelectedTable(renameData.newName);
        }
        setToast({ message: '重命名成功', type: 'success' });
      } else {
        setToast({ message: result.error || '重命名失败', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
      setShowRenameModal(false);
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestionInfo.show) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionInfo(prev => ({ ...prev, index: (prev.index + 1) % prev.list.length }));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionInfo(prev => ({ ...prev, index: (prev.index - 1 + prev.list.length) % prev.list.length }));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selectedItem = suggestionInfo.list[suggestionInfo.index];
        if (selectedItem) insertSuggestion(selectedItem.name);
      } else if (e.key === 'Escape') {
        setSuggestionInfo(prev => ({ ...prev, show: false }));
      }
    }
  };

  const insertSuggestion = (tableName: string) => {
    const textarea = document.querySelector('.sql-editor-container textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const value = textarea.value;
    const start = suggestionInfo.start;

    // 找到当前单词的结束位置（支持覆盖完整单词）
    let end = textarea.selectionStart;
    const rest = value.substring(end);
    const wordEndMatch = rest.match(/^[a-zA-Z0-9_]+/);
    if (wordEndMatch) {
      end += wordEndMatch[0].length;
    }

    const before = value.substring(0, start);
    const after = value.substring(end);
    const newValue = before + tableName + ' ' + after;

    setConsoles(prev => prev.map(c =>
      c.id === activeConsoleId ? {
        ...c,
        sql: newValue,
        isDirty: newValue !== c.savedSql
      } : c
    ));

    setSuggestionInfo(prev => ({ ...prev, show: false }));

    // 恢复焦点并设置光标位置
    setTimeout(() => {
      textarea.focus();
      const newPos = start + tableName.length + 1;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const updateSuggestions = () => {
    // 只有在 SQL 或 Redis 控制台且有活跃连接时才提示
    if (!activeConsoleId || !activeConnection) return;

    setTimeout(() => {
      const textarea = document.querySelector('.sql-editor-container textarea') as HTMLTextAreaElement;
      if (!textarea) return;

      const value = textarea.value;
      const pos = textarea.selectionStart;
      const textBefore = value.substring(0, pos);

      // 获取当前正在输入的词 (英文字母、数字、下划线)
      const match = textBefore.match(/([a-zA-Z0-9_]+)$/);
      if (!match) {
        setSuggestionInfo(prev => ({ ...prev, show: false }));
        return;
      }

      const word = match[1].toLowerCase();
      const start = match.index!;

      const keywordSuggestions = SQL_KEYWORDS
        .filter((k) => k.toLowerCase().startsWith(word) && k.toLowerCase() !== word)
        .slice(0, 30)
        .map((name) => ({ name, kind: 'keyword' as const }));

      const tableSuggestions = tables
        .map((t) => t.name)
        .filter((name) => name.toLowerCase().includes(word) && name.toLowerCase() !== word)
        .slice(0, 30)
        .map((name) => ({ name, kind: 'table' as const }));

      // 关键字优先，其次表名
      const filtered = [...keywordSuggestions, ...tableSuggestions].slice(0, 50);

      if (filtered.length === 0) {
        setSuggestionInfo(prev => ({ ...prev, show: false }));
        return;
      }

      // 计算位置
      const container = document.querySelector('.sql-editor-container');
      if (container) {
        const rect = container.getBoundingClientRect();
        const div = document.createElement('div');
        const style = window.getComputedStyle(textarea);
        const properties = [
          'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
          'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
          'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
          'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
          'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent',
          'textDecoration', 'letterSpacing', 'wordSpacing', 'whiteSpace', 'wordBreak',
          'wordWrap'
        ];
        properties.forEach(prop => {
          // @ts-ignore
          div.style[prop] = style[prop];
        });
        div.style.position = 'absolute';
        div.style.visibility = 'hidden';
        div.style.whiteSpace = 'pre-wrap';
        div.style.wordWrap = 'break-word';
        div.style.top = '0';
        div.style.left = '0';

        const textBeforeWord = value.substring(0, start);
        const span = document.createElement('span');
        span.textContent = textBeforeWord;
        div.appendChild(span);

        const marker = document.createElement('span');
        marker.textContent = '|';
        div.appendChild(marker);

        document.body.appendChild(div);
        const markerRect = marker.getBoundingClientRect();
        const divRect = div.getBoundingClientRect();

        const fontSize = parseInt(style.fontSize) || 14;
        const lineHeight = parseInt(style.lineHeight) || fontSize * 1.5;

        let posX = markerRect.left - divRect.left + textarea.offsetLeft - textarea.scrollLeft;
        let posY = markerRect.top - divRect.top + textarea.offsetTop - textarea.scrollTop + lineHeight + 24; // 进一步增加间距，让提示框明显下移

        // 边界检查：如果下方空间不足，则显示在上方
        const suggestionHeight = Math.min(filtered.length * 36 + 40, 240); // 预估高度
        if (posY + suggestionHeight > rect.height + rect.top) {
          posY = posY - lineHeight - suggestionHeight - 28; // 向上翻转时也保持较大间距
        }

        setSuggestionInfo({
          show: true,
          list: filtered,
          index: 0,
          word,
          start,
          x: posX,
          y: posY
        });

        document.body.removeChild(div);
      }
    }, 0);
  };

  const handleConsoleDBChange = async (id: string, dbName: string) => {
    if (dbName !== selectedDatabase) {
      const switchRes = await window.electronAPI.useDatabase(dbName);
      if (!switchRes.success) {
        setToast({ message: switchRes.error || '切换数据库失败', type: 'error' });
        return;
      }
      setSelectedDatabase(dbName);
      const tableList = await window.electronAPI.getTables();
      setTables(tableList);
    }
    setConsoles(prev => prev.map(c => c.id === id ? { ...c, dbName } : c));
  }

  const handleConsoleTableSelect = (tableName: string) => {
    const activeConsole = consoles.find(c => c.id === activeConsoleId);
    if (activeConsole) {
      const sqlToAdd = `\nSELECT * FROM \`${tableName}\` LIMIT 100;`;
      setConsoles(prev => prev.map(c => c.id === activeConsoleId ? { ...c, sql: c.sql + sqlToAdd } : c));
    }
  }

  const handleDeleteTable = async (tableName: string) => {
    const isRedis = activeConnection?.type === 'redis';
    confirm({
      title: isRedis ? '删除 Key' : '删除表',
      message: `确定要删除 ${isRedis ? 'Key' : '表'} "${tableName}" 吗？此操作不可撤销！`,
      type: 'danger',
      onConfirm: async () => {
        setLoading(true);
        try {
          const res = await window.electronAPI.deleteTable(tableName);
          if (res.success) {
            setToast({ message: isRedis ? `Key ${tableName} 已删除` : `表 ${tableName} 已删除`, type: 'success' });
            if (isRedis) {
              // Redis 删除的是 Key，刷新当前数据列表
              handleSelectTable(selectedTable!, currentPage, pageSize);
            } else {
              // SQL 删除的是表，刷新表列表
              const tableList = await window.electronAPI.getTables();
              setTables(tableList);
              if (selectedTable === tableName) {
                setSelectedTable(null);
                setData([]);
                setColumns([]);
              }
            }
          } else {
            setToast({ message: res.error || '删除失败', type: 'error' });
          }
        } catch (err: any) {
          setToast({ message: err.message, type: 'error' });
        } finally {
          setLoading(false);
          setContextMenu(null);
        }
      }
    });
  };

  const handleTruncateTable = async (tableName: string) => {
    if (!activeConnection || activeConnection.type === 'redis') return;
    confirm({
      title: '清空表',
      message: `确定要清空表 "${tableName}" 吗？将删除该表所有数据，但保留表结构。`,
      type: 'danger',
      onConfirm: async () => {
        setLoading(true);
        try {
          const quotedTableName = quoteTableNameForQuery(tableName, activeConnection?.type);
          const sql = activeConnection.type === 'sqlite'
            ? `DELETE FROM ${quotedTableName}`
            : `TRUNCATE TABLE ${quotedTableName}`;
          const result = await window.electronAPI.executeQuery(sql);
          if (!result.success) {
            throw new Error(result.error || '清空表失败');
          }

          // 若当前正在查看该表，清空后刷新数据视图
          if (selectedTable === tableName) {
            await handleSelectTable(tableName, 1, pageSize);
          }
          setToast({ message: `表 ${tableName} 已清空`, type: 'success' });
        } catch (err: any) {
          setToast({ message: err.message || '清空表失败', type: 'error' });
        } finally {
          setLoading(false);
          setContextMenu(null);
        }
      }
    });
  };

  const handleTableContextMenu = (e: React.MouseEvent, tableName: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'table', target: tableName });
  };

  const handleCopyInspectorSql = async () => {
    const sqlText = tableInspector.ddl || '-- 暂无建表语句 --';
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sqlText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = sqlText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setToast({ message: 'Create SQL 已复制到剪贴板', type: 'success' });
    } catch (err: any) {
      setToast({ message: err?.message || '复制失败', type: 'error' });
    }
  };

  const handleOpenSqlScriptPicker = (scope: 'database' | 'table', target: string) => {
    if (!activeConnection) {
      setToast({ message: '请先连接数据库', type: 'error' });
      return;
    }
    if (activeConnection.type === 'redis') {
      setToast({ message: 'Redis 不支持 SQL 脚本执行', type: 'error' });
      return;
    }

    const dbName = scope === 'database' ? target : selectedDatabase;
    if (!dbName) {
      setToast({ message: '请先选择数据库', type: 'error' });
      return;
    }

    setPendingSqlScriptTarget(
      scope === 'database'
        ? { scope, dbName }
        : { scope, dbName, tableName: target }
    );
    sqlScriptFileInputRef.current?.click();
  };

  const handleSqlScriptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !pendingSqlScriptTarget) return;

    let shouldRefreshSelectedTable = false;
    try {
      setLoading(true);

      const useDbRes = await window.electronAPI.useDatabase(pendingSqlScriptTarget.dbName);
      if (!useDbRes.success) {
        throw new Error(useDbRes.error || '切换数据库失败');
      }
      setSelectedDatabase(pendingSqlScriptTarget.dbName);

      const results: { fileName: string; success: boolean; error?: string }[] = [];
      for (const file of files) {
        try {
          const sqlText = await file.text();
          if (!sqlText.trim()) {
            results.push({ fileName: file.name, success: false, error: '脚本文件为空' });
            continue;
          }

          const execRes = await window.electronAPI.executeQuery(sqlText);
          if (!execRes.success) {
            results.push({ fileName: file.name, success: false, error: execRes.error || 'SQL 脚本执行失败' });
            continue;
          }

          results.push({ fileName: file.name, success: true });
        } catch (err: any) {
          results.push({ fileName: file.name, success: false, error: err?.message || '脚本执行异常' });
        }
      }

      const tableList = await window.electronAPI.getTables();
      setTables(tableList);

      if (
        pendingSqlScriptTarget.scope === 'table' &&
        pendingSqlScriptTarget.tableName &&
        selectedTable === pendingSqlScriptTarget.tableName
      ) {
        shouldRefreshSelectedTable = true;
      }

      const successCount = results.filter((r) => r.success).length;
      const failItems = results.filter((r) => !r.success);
      const failCount = failItems.length;
      const failureSummary = failItems
        .slice(0, 5)
        .map((item) => `${item.fileName}(${item.error || '执行失败'})`)
        .join('；');
      const hasMoreFailure = failCount > 5;
      const message = failCount === 0
        ? `共执行 ${files.length} 个脚本，全部成功。`
        : `共执行 ${files.length} 个脚本，成功 ${successCount} 个，失败 ${failCount} 个。${failureSummary ? `失败详情：${failureSummary}${hasMoreFailure ? `；另有 ${failCount - 5} 个失败` : ''}` : ''}`;

      confirm({
        title: 'SQL 脚本执行结果',
        message,
        type: failCount === 0 ? 'info' : 'warning',
        buttons: [{ label: '知道了', onClick: () => {}, variant: 'primary' }]
      });
      setToast({ message: failCount === 0 ? '批量脚本执行完成' : '批量脚本执行完成（含失败）', type: failCount === 0 ? 'success' : 'info' });
    } catch (err: any) {
      setToast({ message: err.message || 'SQL 脚本执行失败', type: 'error' });
    } finally {
      setLoading(false);
      setPendingSqlScriptTarget(null);
      if (shouldRefreshSelectedTable && selectedTable) {
        await handleSelectTable(selectedTable, currentPage, pageSize);
      }
    }
  };

  const handleOpenSchemaModal = async (tableName: string) => {
    setLoading(true);
    try {
      const [cols, idxs] = await Promise.all([
        window.electronAPI.getTableColumns(tableName),
        window.electronAPI.getTableIndexes(tableName)
      ]);
      // 为每一列添加一个唯一 ID，方便前端管理
      const colsWithId = cols.map((c, i) => ({ ...c, id: Date.now() + i, originalName: c.name }));
      const idxsWithId = idxs.map((idx, i) => ({ ...idx, id: Date.now() + 1000 + i, originalName: idx.name }));
      setSchemaData({ tableName, columns: colsWithId, indexes: idxsWithId });
      setActiveSchemaTab('columns');
      setShowSchemaModal(true);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSchema = async () => {
    setLoading(true);
    try {
      if (schemaData.tableName === 'new_table' || !tables.some(t => t.name === schemaData.tableName)) {
        // 创建新表 (暂不支持带索引创建，后续可扩展)
        if (!schemaData.tableName || schemaData.tableName === 'new_table') {
          setToast({ message: '请输入有效的表名', type: 'error' });
          return;
        }
        const result = await window.electronAPI.createTable(schemaData.tableName, schemaData.columns, schemaData.indexes);
        if (result.success) {
          setShowSchemaModal(false);
          setToast({ message: `表 ${schemaData.tableName} 创建成功`, type: 'success' });
          const tableList = await window.electronAPI.getTables();
          setTables(tableList);
          handleSelectTable(schemaData.tableName);
        } else {
          setToast({ message: result.error || '创建表失败', type: 'error' });
        }
        return;
      }

      // 找出新增、修改、删除的列
      const originalCols = await window.electronAPI.getTableColumns(schemaData.tableName);
      const originalIdxs = await window.electronAPI.getTableIndexes(schemaData.tableName);

      const changes: any = {
        added: schemaData.columns.filter(c => !originalCols.some(oc => oc.name === c.originalName)),
        modified: schemaData.columns
          .filter(c => originalCols.some(oc => oc.name === c.originalName))
          .map(c => ({
            oldName: c.originalName,
            column: { ...c }
          }))
          .filter(m => {
            const oc = originalCols.find(o => o.name === m.oldName);
            return oc && (
              oc.name !== m.column.name ||
              oc.type !== m.column.type ||
              oc.nullable !== m.column.nullable ||
              oc.primaryKey !== m.column.primaryKey ||
              oc.defaultValue !== m.column.defaultValue ||
              oc.autoIncrement !== m.column.autoIncrement ||
              (oc.comment || '') !== (m.column.comment || '')
            );
          }),
        removed: originalCols
          .filter(oc => !schemaData.columns.some(c => c.originalName === oc.name))
          .map(oc => oc.name),
        indexes: {
          added: schemaData.indexes.filter(idx => {
            // 新增的索引
            const isNew = !originalIdxs.some(oi => oi.name === idx.originalName);
            if (isNew) return true;

            // 检查现有索引是否被修改（名称、唯一性或包含列改变）
            const oi = originalIdxs.find(o => o.name === idx.originalName);
            const hasChanged = oi && (
              oi.name !== idx.name ||
              oi.unique !== idx.unique ||
              JSON.stringify(oi.columns) !== JSON.stringify(idx.columns)
            );
            return !!hasChanged;
          }),
          removed: originalIdxs
            .filter(oi => {
              // 被删除的索引
              const stillExists = schemaData.indexes.some(idx => idx.originalName === oi.name);
              if (!stillExists) return true;

              // 被修改的索引需要先删除旧的再添加新的
              const idx = schemaData.indexes.find(i => i.originalName === oi.name);
              const hasChanged = idx && (
                oi.name !== idx.name ||
                oi.unique !== idx.unique ||
                JSON.stringify(oi.columns) !== JSON.stringify(idx.columns)
              );
              return !!hasChanged;
            })
            .map(oi => oi.name)
        }
      };

      const result = await window.electronAPI.updateTableSchema(schemaData.tableName, changes);
      if (result.success) {
        setShowSchemaModal(false);
        setToast({ message: `表 ${schemaData.tableName} 修改成功`, type: 'success' });
        // 刷新当前表数据
        if (selectedTable === schemaData.tableName) {
          handleSelectTable(schemaData.tableName);
        }
      } else {
        setToast({ message: result.error || '修改失败', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateColumnCommentsByAI = async () => {
    if (schemaCommentAILoading) return;
    const tableName = (schemaData.tableName || '').trim();
    const cols = (schemaData.columns || []).filter((c) => c?.name && String(c.name).trim() !== '');
    if (!tableName || tableName === 'new_table') {
      setToast({ message: '请先填写有效表名后再生成注释', type: 'error' });
      return;
    }
    if (cols.length === 0) {
      setToast({ message: '请先添加字段后再生成注释', type: 'error' });
      return;
    }

    setSchemaCommentAILoading(true);
    try {
      const payload = cols.map((c) => ({
        name: String(c.name),
        type: c.type ? String(c.type) : '',
        nullable: !!c.nullable,
        primaryKey: !!c.primaryKey
      }));
      const prompt = `请为以下数据表字段生成简洁、专业的中文注释，只返回 JSON，不要解释。
数据库类型: ${activeConnection?.type || 'unknown'}
表名: ${tableName}
字段:
${JSON.stringify(payload)}

返回格式:
{"comments":[{"name":"字段名","comment":"字段注释"}]}

规则:
1) name 必须严格来自输入字段名，不能新增或修改字段名；
2) comment 控制在 4-30 个中文字符；
3) 若是 id 主键，可使用“主键ID”；
4) 不确定时给通用且安全的业务描述，不要编造不存在的含义。`;

      const aiRes = await window.electronAPI.aiChat([
        { role: 'system', content: '你是数据库建模助手。必须只返回合法 JSON。' },
        { role: 'user', content: prompt }
      ]);

      if (!aiRes.success || !aiRes.response) {
        setToast({ message: aiRes.error || 'AI 生成字段注释失败', type: 'error' });
        return;
      }

      const raw = aiRes.response.trim();
      const jsonBlock = raw.match(/```json\s*([\s\S]*?)```/i)?.[1] || raw.match(/\{[\s\S]*\}/)?.[0];
      if (!jsonBlock) {
        setToast({ message: 'AI 返回格式无法解析，请重试', type: 'error' });
        return;
      }

      let parsed: any = null;
      try {
        parsed = JSON.parse(jsonBlock);
      } catch {
        setToast({ message: 'AI 返回 JSON 解析失败，请重试', type: 'error' });
        return;
      }

      const comments = Array.isArray(parsed?.comments) ? parsed.comments : [];
      if (comments.length === 0) {
        setToast({ message: 'AI 未返回可用注释', type: 'info' });
        return;
      }

      const commentMap = new Map<string, string>();
      comments.forEach((item: any) => {
        const name = item?.name != null ? String(item.name).trim() : '';
        const comment = item?.comment != null ? String(item.comment).trim() : '';
        if (name && comment) {
          commentMap.set(name, comment);
        }
      });

      let updatedCount = 0;
      const nextColumns = schemaData.columns.map((col) => {
        const colName = col?.name != null ? String(col.name).trim() : '';
        const aiComment = commentMap.get(colName);
        if (!aiComment) return col;
        if ((col.comment || '') === aiComment) return col;
        updatedCount += 1;
        return { ...col, comment: aiComment };
      });

      setSchemaData((prev) => ({ ...prev, columns: nextColumns }));
      setToast({
        message: updatedCount > 0 ? `AI 已生成 ${updatedCount} 个字段注释` : 'AI 注释已是最新，无需更新',
        type: updatedCount > 0 ? 'success' : 'info'
      });
    } catch (err: any) {
      setToast({ message: err.message || 'AI 生成字段注释失败', type: 'error' });
    } finally {
      setSchemaCommentAILoading(false);
    }
  };

  // 只读连接包：选择文件 → 口令弹窗
  const handleImportPackage = async () => {
    try {
      const res = await window.electronAPI.pickConnectionPackageFile();
      if (!res.success || !res.content) {
        if (res.error) setToast({ message: res.error, type: 'error' });
        return;
      }
      setPackageError('');
      setPackageModal({ mode: 'import', payload: res.content });
    } catch (err: any) {
      setToast({ message: err?.message || '打开连接包失败', type: 'error' });
    }
  };

  // 只读连接包：从连接配置弹窗发起导出
  const handleExportPackage = (config: ConnectionConfig) => {
    // 多选授权库依赖实例的库列表，必须先连接该连接
    if (activeConnection?.id !== config.id || databases.length === 0) {
      setToast({ message: '请先连接该连接再导出连接包（需要多选要授权的数据库）', type: 'error' });
      return;
    }
    setPackageError('');
    setPackageModal({
      mode: 'export',
      config,
      databases,
      defaultDatabase: selectedDatabase || undefined
    });
  };

  // 只读连接包：口令确认（导出加密写盘 / 导入解密入库）
  const handlePackageConfirm = async (passphrase: string, expiresAt?: number, allowedDatabases?: string[]) => {
    if (!packageModal) return;
    setPackageLoading(true);
    setPackageError('');
    try {
      if (packageModal.mode === 'export') {
        // 授权库白名单来自弹窗多选结果，随配置一起加密进包
        const exportConfig = { ...packageModal.config, allowedDatabases: allowedDatabases || [] };
        const res = await window.electronAPI.exportConnectionPackage(exportConfig, passphrase, expiresAt || 0);
        if (!res.success) throw new Error(res.error || '导出连接包失败');
        setPackageModal(null);
        setToast({ message: `只读连接包已导出${res.filePath ? `：${res.filePath}` : ''}`, type: 'success' });
      } else {
        const res = await window.electronAPI.decryptConnectionPackage(packageModal.payload, passphrase);
        if (!res.success || !res.config) throw new Error(res.error || '解密连接包失败');
        // 剥掉导出方的本地 id，导入为新连接；解密结果已强制 readOnly + locked
        const imported: ConnectionConfig = { ...res.config, id: undefined };
        await window.electronAPI.saveConnection(imported);
        await loadSavedConnections();
        setPackageModal(null);
        setToast({ message: `只读连接「${imported.name}」已导入`, type: 'success' });
      }
    } catch (err: any) {
      setPackageError(err?.message || '操作失败');
    } finally {
      setPackageLoading(false);
    }
  };

  const connectingConnectionName = useMemo(
    () => savedConnections.find((c) => c.id === connectingConnectionId)?.name || '',
    [savedConnections, connectingConnectionId]
  );

  return (
    <div className="flex h-screen bg-[#f8fafc] text-slate-700 font-sans selection:bg-blue-100 overflow-hidden">
      <style>{editorStyles}</style>
      {/* Sidebar */}
      <Sidebar
        sidebarWidth={sidebarWidth}
        onStartResize={() => setIsResizingSidebar(true)}
        onOpenAgent={handleOpenAgent}
        onAddConnection={() => {
          setNewConfig({ name: '', type: 'mysql', host: 'localhost', port: 3306, user: 'root', password: '', database: '' });
          setIsEditingConnection(false);
          setShowAddModal(true);
        }}
        savedConnections={savedConnections}
        activeConnection={activeConnection}
        onImportPackage={handleImportPackage}
        connectingConnectionId={connectingConnectionId}
        expandedConnections={expandedConnections}
        expandedDatabases={expandedDatabases}
        databases={databases}
        filteredDatabases={filteredDatabases}
        tables={tables}
        pinnedTables={pinnedTables}
        selectedDatabase={selectedDatabase}
        selectedTable={selectedTable}
        onConnect={handleConnect}
        onEditConnection={handleEditConnection}
        onDeleteConnection={handleDeleteConnection}
        onRefreshDatabases={loadDatabases}
        onOpenSchemaFilter={handleOpenSchemaFilterModal}
        onSelectDatabase={handleSelectDatabase}
        onDatabaseContextMenu={(db, x, y) => setContextMenu({ x, y, type: 'database', target: db })}
        onSelectTable={handleSelectTable}
        onTableContextMenu={(name, x, y) => setContextMenu({ x, y, type: 'table', target: name })}
        onOpenSettings={() => {
          void loadAiSettings();
          void loadUiSettings();
          setSettingsTab('ai');
          setShowSettings(true);
        }}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Background Gradients */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[120px] -z-10" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-indigo-100/30 rounded-full blur-[100px] -z-10" />

        {/* Header */}
        <HeaderBar
          connectionName={activeConnection?.name ?? null}
          loading={loading}
          selectedDatabase={selectedDatabase}
          selectedTable={selectedTable}
          activeConsoleId={activeConsoleId}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchInputRef={searchInputRef}
          searchMatchesCount={searchMatches.length}
          currentMatchIdx={currentMatchIdx}
          onNextMatch={handleNextMatch}
          onPrevMatch={handlePrevMatch}
          onClearSearch={() => setSearchTerm('')}
        />

        {/* Content Area */}
        <main className="flex-1 overflow-hidden flex flex-col relative">
          {/* Tab Bar for Consoles */}
          {consoles.length > 0 && (
            <ConsoleTabBar
              consoles={consoles}
              activeConsoleId={activeConsoleId}
              selectedTable={selectedTable}
              onSelectConsole={(id) => {
                setActiveConsoleId(id);
                setSelectedTable(null);
              }}
              onConsoleContextMenu={(id, x, y) => setContextMenu({ x, y, type: 'console', target: id })}
              onCloseConsole={handleCloseConsole}
              onOpenLoadConsoleModal={handleOpenLoadConsoleModal}
            />
          )}

          <AnimatePresence mode="wait">
            {selectedTable ? (
              <TableView
                key={selectedTable}
                activeConnection={activeConnection}
                activeFilterCol={activeFilterCol}
                activeSearchRegex={activeSearchRegex}
                activeSearchTerm={activeSearchTerm}
                activeSearchTermLower={activeSearchTermLower}
                columnFilters={columnFilters}
                columns={columns}
                currentMatchIdx={currentMatchIdx}
                currentPage={currentPage}
                data={data}
                deletedRows={deletedRows}
                editingCellCoord={editingCellCoord}
                editingCells={editingCells}
                editValue={editValue}
                filteredData={filteredData}
                filterPopoverPos={filterPopoverPos}
                handleCancelChanges={handleCancelChanges}
                handleCellDoubleClick={handleCellDoubleClick}
                handleCellEditCommit={handleCellEditCommit}
                handleContainerScroll={handleContainerScroll}
                handleCopyInspectorSql={handleCopyInspectorSql}
                handleScrollToBottom={handleScrollToBottom}
                handleScrollToTop={handleScrollToTop}
                handleSelectTable={handleSelectTable}
                handleSort={handleSort}
                handleSubmitChanges={handleSubmitChanges}
                hasActiveFilters={hasActiveFilters}
                insertingRow={insertingRow}
                loading={loading}
                loadTableInspector={loadTableInspector}
                pageSize={pageSize}
                resetAllTableColumnWidths={resetAllTableColumnWidths}
                ROW_HEIGHT={ROW_HEIGHT}
                searchMatches={searchMatches}
                selectedTable={selectedTable}
                setActiveFilterCol={setActiveFilterCol}
                setColumnFilters={setColumnFilters}
                setContextMenu={setContextMenu}
                setEditingCellCoord={setEditingCellCoord}
                setEditValue={setEditValue}
                setFilterPopoverPos={setFilterPopoverPos}
                setInsertingRow={setInsertingRow}
                setIsResizingTableInspector={setIsResizingTableInspector}
                setPageSize={setPageSize}
                setTableInspector={setTableInspector}
                setTextDetail={setTextDetail}
                showScrollButtons={showScrollButtons}
                sortConfig={sortConfig}
                startColumnResize={startColumnResize}
                TABLE_COL_MAX_WIDTH={TABLE_COL_MAX_WIDTH}
                tableColumnWidths={tableColumnWidths}
                tableContainerRef={tableContainerRef}
                tableExecutionTime={tableExecutionTime}
                tableInspector={tableInspector}
                tableInspectorWidth={tableInspectorWidth}
                tableScrollTop={tableScrollTop}
                tableViewportHeight={tableViewportHeight}
                totalPages={totalPages}
                totalRows={totalRows}
                useVirtualScroll={useVirtualScroll}
              />
            ) : activeConsoleId && consoles.find(c => c.id === activeConsoleId) ? (
              <ConsoleView
                key={activeConsoleId}
                activeConnection={activeConnection}
                activeConsoleId={activeConsoleId}
                activeSearchRegex={activeSearchRegex}
                activeSearchTerm={activeSearchTerm}
                activeSearchTermLower={activeSearchTermLower}
                aiPopupRef={aiPopupRef}
                aiSelectionLoading={aiSelectionLoading}
                aiSelectionPrompt={aiSelectionPrompt}
                consoles={consoles}
                databases={databases}
                handleAISelectionSubmit={handleAISelectionSubmit}
                handleConsoleDBChange={handleConsoleDBChange}
                handleConsoleTableSelect={handleConsoleTableSelect}
                handleContainerScroll={handleContainerScroll}
                handleEditorKeyDown={handleEditorKeyDown}
                handleExecuteSQL={handleExecuteSQL}
                handleFormatSQL={handleFormatSQL}
                handleLoadMore={handleLoadMore}
                handleOpenAIModal={handleOpenAIModal}
                handleScrollToBottom={handleScrollToBottom}
                handleScrollToTop={handleScrollToTop}
                handleSelection={handleSelection}
                insertSuggestion={insertSuggestion}
                resetAllResultColumnWidths={resetAllResultColumnWidths}
                resultColumnWidths={resultColumnWidths}
                resultsContainerRef={resultsContainerRef}
                resultsHeight={resultsHeight}
                resultsScrollTop={resultsScrollTop}
                resultsViewportHeight={resultsViewportHeight}
                ROW_HEIGHT={ROW_HEIGHT}
                selectedDatabase={selectedDatabase}
                selectedSql={selectedSql}
                selectionPosition={selectionPosition}
                setAISelectionPrompt={setAISelectionPrompt}
                setConsoleRenameData={setConsoleRenameData}
                setConsoles={setConsoles}
                setIsResizingResults={setIsResizingResults}
                setShowAISelectionInput={setShowAISelectionInput}
                setShowConsoleRenameModal={setShowConsoleRenameModal}
                setSuggestionInfo={setSuggestionInfo}
                setTextDetail={setTextDetail}
                showAISelectionInput={showAISelectionInput}
                showResultsScrollButtons={showResultsScrollButtons}
                startColumnResize={startColumnResize}
                suggestionInfo={suggestionInfo}
                suggestionListRef={suggestionListRef}
                suggestionRef={suggestionRef}
                TABLE_COL_MAX_WIDTH={TABLE_COL_MAX_WIDTH}
                tables={tables}
                updateSuggestions={updateSuggestions}
              />
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center relative overflow-hidden"
              >
                <div className="relative z-10 flex flex-col items-center">
                  <motion.div
                    animate={{
                      y: [0, -10, 0],
                      rotate: [0, 5, -5, 0]
                    }}
                    transition={{
                      duration: 6,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="w-32 h-32 bg-white rounded-[40px] flex items-center justify-center shadow-2xl shadow-slate-200/50 mb-10 border border-slate-100"
                  >
                    <Database size={56} className="text-blue-600 drop-shadow-md" />
                  </motion.div>
                  <h3 className="text-3xl font-bold text-slate-900 tracking-tighter mb-4">AiSqlBoy</h3>
                  <p className="max-w-xs text-center text-slate-500 font-semibold leading-relaxed">
                    新一代 AI 驱动的数据库管理工具。<br/>
                    请从左侧选择一个连接开始探索。
                  </p>
                </div>
                {/* Decoration Circles */}
                <div className="absolute inset-0 flex items-center justify-center -z-10 opacity-40">
                  <div className="w-[400px] h-[400px] border border-slate-200 rounded-full animate-[spin_20s_linear_infinite]" />
                  <div className="w-[600px] h-[600px] border border-slate-200 rounded-full absolute animate-[spin_30s_linear_infinite_reverse]" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {connectingConnectionId !== null && (
          <div className="absolute inset-0 z-40 bg-white/45 backdrop-blur-[1px] flex items-center justify-center">
            <div className="px-5 py-4 rounded-2xl bg-white border border-slate-200 shadow-xl flex items-center gap-3 text-slate-700">
              <Loader2 size={18} className="animate-spin text-blue-600" />
              <div className="text-sm font-semibold">
                正在连接 {connectingConnectionName || '目标连接'}，请稍候...
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals with AnimatePresence */}
      <AnimatePresence>
        {showConsoleRenameModal && (
          <ConsoleRenameModal
            data={consoleRenameData}
            onClose={() => setShowConsoleRenameModal(false)}
            onChange={setConsoleRenameData}
            onSave={handleSaveConsole}
          />
        )}
        <ConfirmModal
          show={showConfirm}
          title={confirmOptions.title}
          message={confirmOptions.message}
          type={confirmOptions.type}
          buttons={confirmOptions.buttons}
        onConfirm={confirmOptions.onConfirm}
          onCancel={() => setShowConfirm(false)}
        />
        {showAddModal && (
          <ConnectionModal
            config={newConfig}
            onChange={setNewConfig}
            onClose={() => setShowAddModal(false)}
            onSave={handleSaveConnection}
            onExportPackage={handleExportPackage}
          />
        )}
        {packageModal && (
          <ConnectionPackageModal
            mode={packageModal.mode}
            connectionName={packageModal.mode === 'export' ? packageModal.config.name : undefined}
            databases={packageModal.mode === 'export' ? packageModal.databases : undefined}
            defaultDatabase={packageModal.mode === 'export' ? packageModal.defaultDatabase : undefined}
            loading={packageLoading}
            error={packageError}
            onClose={() => {
              if (!packageLoading) {
                setPackageModal(null);
                setPackageError('');
              }
            }}
            onConfirm={handlePackageConfirm}
          />
        )}
      </AnimatePresence>

      {/* Schema Filter Modal */}
      <AnimatePresence>
        {showSchemaFilterModal && activeConnection && (
          <SchemaFilterModal
            connectionName={activeConnection.name}
            databases={databases}
            draft={schemaFilterDraft}
            onDraftChange={setSchemaFilterDraft}
            onClose={() => setShowSchemaFilterModal(false)}
            onSave={handleSaveSchemaFilter}
          />
        )}
      </AnimatePresence>

      {/* Text Detail Modal */}
      <AnimatePresence>
        {textDetail && (
          <TextDetailModal
            detail={textDetail}
            onClose={() => setTextDetail(null)}
            onToast={setToast}
          />
        )}
      </AnimatePresence>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <AppContextMenu
            contextMenu={contextMenu}
            connectionType={activeConnection?.type}
            readOnly={!!activeConnection?.readOnly}
            selectedDatabase={selectedDatabase}
            insertingRow={!!insertingRow}
            deletedRows={deletedRows}
            pinnedTables={pinnedTables}
            onClose={() => setContextMenu(null)}
            onToggleInsertRow={() => {
              if (insertingRow) setInsertingRow(null);
              else handleStartInsertRow();
            }}
            onDeleteRow={handleLocalRowDelete}
            onRenameConsole={(id) => {
              const tab = consoles.find(c => c.id === id);
              if (tab) {
                setConsoleRenameData({ id: tab.id, name: tab.name });
                setShowConsoleRenameModal(true);
              }
            }}
            onDeleteConsole={handleDeleteConsole}
            onCloseConsole={handleCloseConsole}
            onNewConsole={handleNewConsole}
            onOpenAIModal={handleOpenAIModal}
            onOpenSqlScriptPicker={handleOpenSqlScriptPicker}
            onGenerateSchemaER={(dbName) => setErSchemaLanguagePickDb(dbName)}
            onGenerateTableER={(tableName) => setErLanguagePickTable(tableName)}
            onCreateTable={() => {
              setSchemaData({ tableName: 'new_table', columns: [], indexes: [] });
              setShowSchemaModal(true);
            }}
            onRefreshDatabases={loadDatabases}
            onExportDB={handleExportDB}
            onDeleteDB={handleDeleteDB}
            onSelectTable={handleSelectTable}
            onTogglePin={togglePinTable}
            onRefreshTables={async () => {
              const tableList = await window.electronAPI.getTables();
              setTables(tableList);
            }}
            onOpenSchemaModal={handleOpenSchemaModal}
            onTruncateTable={handleTruncateTable}
            onRenameTable={(tableName) => {
              setRenameData({ oldName: tableName, newName: tableName });
              setShowRenameModal(true);
            }}
            onDeleteTable={handleDeleteTable}
          />
        )}
      </AnimatePresence>


      {/* AI Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <SettingsModal
            settingsTab={settingsTab}
            onTabChange={setSettingsTab}
            providerVendor={providerVendor}
            onVendorChange={(v) => {
              setProviderVendor(v);
              setProviderModel(defaultModelForVendor(v));
              setProviderApiVersion(AI_VERSION_OPTIONS[v][0]?.value ?? '');
            }}
            providerModel={providerModel}
            onModelChange={setProviderModel}
            providerApiVersion={providerApiVersion}
            onApiVersionChange={setProviderApiVersion}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            showApiKeyPlain={showApiKeyPlain}
            onToggleApiKeyPlain={() => setShowApiKeyPlain((v) => !v)}
            uiFontFamily={uiFontFamily}
            onUIFontChange={setUiFontFamily}
            uiThemeMode={uiThemeMode}
            onUIThemeChange={setUiThemeMode}
            appVersion={appVersion}
            updateStatus={updateStatus}
            onCheckUpdates={handleCheckUpdates}
            onDownloadUpdate={handleDownloadUpdate}
            onInstallUpdate={handleInstallUpdate}
            onClose={() => setShowSettings(false)}
            onSave={handleSaveSettings}
          />
        )}
      </AnimatePresence>


      {/* Update Modal */}
      <AnimatePresence>
        {showUpdateModal && (
          <UpdateModal
            updateStatus={updateStatus}
            onClose={() => setShowUpdateModal(false)}
            onDownload={handleDownloadUpdate}
            onInstall={handleInstallUpdate}
          />
        )}
      </AnimatePresence>


      <AIAssistantModal
        show={showAIModal}
        aiContext={aiContext}
        aiMessages={aiMessages}
        aiLoading={aiLoading}
        aiPrompt={aiPrompt}
        setAIPrompt={setAIPrompt}
        onClose={() => setShowAIModal(false)}
        onSubmit={handleAIChat}
        onApplySQL={handleApplyAISQL}
      />

<AgentPanel
show={showAgentPanel}
onClose={handleCloseAgent}
messages={agentMessages}
loading={agentLoading}
busy={agentBusy}
onToast={(m) => setToast({ message: m, type: 'info' })}
input={agentInput}
setInput={setAgentInput}
onSubmit={handleAgentSubmit}
onCancel={handleCancelAgent}
permissionLevel={permissionLevel}
onPermissionChange={handlePermissionChange}
permissionLocked={permissionLocked}
onApproveAction={handleApproveAction}
onRejectAction={handleRejectAction}
onClearSession={handleClearSession}
errorMessage={agentError}
iteration={agentIteration}
databases={databases}
selectedDatabase={selectedDatabase}
onSelectDatabase={(db) => { handleSelectDatabase(db); }}
tables={tables}
selectedTable={selectedTable}
onSelectTable={(table) => { if (table) handleSelectTable(table); else setSelectedTable(null); }}
conversationsByConn={conversationsByConn}
currentConversationId={currentConversationId}
currentConvConnectionId={currentConvConnectionId}
onNewConversation={handleNewConversation}
onSelectConversation={handleSelectConversation}
onDeleteConversation={handleDeleteConversation}
onRenameConversation={handleRenameConversation}
onConnect={handleConnect}
savedConnections={savedConnections}
activeConnectionId={activeConnection?.id}
activeConnectionName={activeConnection?.name}
/>

      <ERDiagramModal
        show={erDiagram.show}
        loading={erDiagram.loading}
        tableName={erDiagram.tableName}
        entityDisplayName={erDiagram.entityDisplayName}
        attributes={erDiagram.attributes}
        sourceSql={erDiagram.sourceSql}
        labelLanguage={erDiagram.labelLanguage}
        onClose={() => setERDiagram((prev) => ({ ...prev, show: false }))}
      />

      <ERSchemaDiagramModal
        show={erSchemaDiagram.show}
        loading={erSchemaDiagram.loading}
        databaseName={erSchemaDiagram.databaseName}
        tables={erSchemaDiagram.tables}
        relationships={erSchemaDiagram.relationships}
        summary={erSchemaDiagram.summary}
        labelLanguage={erSchemaDiagram.labelLanguage}
        onClose={() => setErSchemaDiagram((prev) => ({ ...prev, show: false }))}
      />

      <AnimatePresence>
        {erLanguagePickTable && (
          <div className="fixed inset-0 z-[240] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/30"
              onClick={() => setErLanguagePickTable(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative z-10 bg-white border border-slate-200 rounded-2xl shadow-xl p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="text-base font-bold text-slate-900 mb-1">生成 ER 图</h4>
              <p className="text-xs text-slate-500 mb-4">选择图上文字语言；字段名为 id 的始终显示为 id</p>
              <div className="flex flex-col gap-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold"
                  onClick={() => {
                    const t = erLanguagePickTable;
                    setErLanguagePickTable(null);
                    void handleGenerateERDiagram(t, 'zh');
                  }}
                >
                  中文
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 rounded-xl border border-slate-200 text-slate-800 text-sm font-semibold hover:bg-slate-50"
                  onClick={() => {
                    const t = erLanguagePickTable;
                    setErLanguagePickTable(null);
                    void handleGenerateERDiagram(t, 'en');
                  }}
                >
                  English
                </motion.button>
                <button
                  type="button"
                  className="w-full py-2 text-xs text-slate-500"
                  onClick={() => setErLanguagePickTable(null)}
                >
                  取消
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {erSchemaLanguagePickDb && (
          <div className="fixed inset-0 z-[240] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/30"
              onClick={() => setErSchemaLanguagePickDb(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative z-10 bg-white border border-slate-200 rounded-2xl shadow-xl p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="text-base font-bold text-slate-900 mb-1">生成库 ER 图</h4>
              <p className="text-xs text-slate-500 mb-4">
                每表单独成图：矩形为实体、椭圆为属性；表间以菱形表示关系，连线上标注基数（如多/一），箭头指向父表
              </p>
              <div className="flex flex-col gap-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold"
                  onClick={() => {
                    const db = erSchemaLanguagePickDb;
                    setErSchemaLanguagePickDb(null);
                    if (db) void handleGenerateSchemaERDiagram(db, 'zh');
                  }}
                >
                  中文
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 rounded-xl border border-slate-200 text-slate-800 text-sm font-semibold hover:bg-slate-50"
                  onClick={() => {
                    const db = erSchemaLanguagePickDb;
                    setErSchemaLanguagePickDb(null);
                    if (db) void handleGenerateSchemaERDiagram(db, 'en');
                  }}
                >
                  English
                </motion.button>
                <button
                  type="button"
                  className="w-full py-2 text-xs text-slate-500"
                  onClick={() => setErSchemaLanguagePickDb(null)}
                >
                  取消
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Table Modal */}
      <AnimatePresence>
        {showRenameModal && (
          <RenameTableModal
            data={renameData}
            onChange={setRenameData}
            onClose={() => setShowRenameModal(false)}
            onRename={handleRenameTable}
          />
        )}
      </AnimatePresence>
      {/* Schema Editor Modal */}
      <AnimatePresence>
        {showSchemaModal && (
          <SchemaEditorModal
            schemaData={schemaData}
            onSchemaChange={setSchemaData}
            activeSchemaTab={activeSchemaTab}
            onTabChange={setActiveSchemaTab}
            schemaCommentAILoading={schemaCommentAILoading}
            onGenerateAIComments={handleGenerateColumnCommentsByAI}
            connectionType={activeConnection?.type}
            readOnly={!!activeConnection?.readOnly}
            existingTables={tables.map(t => t.name)}
            onClose={() => setShowSchemaModal(false)}
            onSave={handleUpdateSchema}
          />
        )}
      </AnimatePresence>

      {/* Load Console Modal */}
      <AnimatePresence>
        {showLoadConsoleModal && (
          <LoadConsoleModal
            savedConsoles={savedConsoles}
            openIds={consoles.map((c) => c.id)}
            onClose={() => setShowLoadConsoleModal(false)}
            onRestore={handleRestoreConsole}
          />
        )}
      </AnimatePresence>

      <input
        ref={sqlScriptFileInputRef}
        type="file"
        accept=".sql,text/sql"
        multiple
        className="hidden"
        onChange={handleSqlScriptFileChange}
      />

      {/* Global Toast */}
      <AnimatePresence>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
