import React, { useState, useEffect } from 'react'
import { Database, Table, Play, Plus, Trash2, X, Server, HardDrive, RefreshCw, ChevronRight, Layout, Settings, Activity, AlignLeft, Bot, Sparkles, Send, Loader2, Key, Search, ArrowUp, ArrowDown, FileJson, Save, Terminal, Download, CheckCircle2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ConnectionConfig } from '../shared/types'
import { format } from 'sql-formatter'
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-sql';
import 'prismjs/themes/prism.css';

declare global {
  interface Window {
    electronAPI: {
      getSavedConnections: () => Promise<ConnectionConfig[]>
      saveConnection: (config: ConnectionConfig) => Promise<any>
      deleteConnection: (id: number) => Promise<any>
      
      // Console Management
      getConsoles: (connectionId?: number) => Promise<any[]>
      saveConsole: (console: any) => Promise<any>
      deleteConsole: (id: string) => Promise<any>
      
      connectDB: (config: ConnectionConfig) => Promise<{ success: boolean; error?: string }>
      getDatabases: () => Promise<string[]>
      useDatabase: (dbName: string) => Promise<{ success: boolean; error?: string }>
      getTables: () => Promise<{ name: string }[]>
      getTableData: (tableName: string, limit?: number, offset?: number, orderBy?: string, orderDir?: 'ASC' | 'DESC') => Promise<{ data: any[], total: number }>
      getTableColumns: (tableName: string) => Promise<any[]>
      renameTable: (oldName: string, newName: string) => Promise<{ success: boolean; error?: string }>
      deleteTable: (tableName: string) => Promise<{ success: boolean; error?: string }>
      createTable: (tableName: string, columns: any[], indexes?: any[]) => Promise<{ success: boolean; error?: string }>
      getTableIndexes: (tableName: string) => Promise<any[]>
      updateTableSchema: (tableName: string, changes: any) => Promise<{ success: boolean; error?: string }>
        exportDatabase: (includeData: boolean) => Promise<{ success: boolean; error?: string }>
        deleteDatabase: (dbName: string) => Promise<{ success: boolean; error?: string }>
        executeQuery: (sql: string) => Promise<{ success: boolean; data: any[]; columns: string[]; error?: string }>
        aiChat: (messages: any[]) => Promise<{ success: boolean; response?: string; error?: string }>
        saveSetting: (key: string, value: string) => Promise<void>
        getSetting: (key: string) => Promise<string | null>
        // Auto Update
        getAppVersion: () => Promise<string>
        checkForUpdates: () => Promise<any>
        downloadUpdate: () => Promise<any>
        quitAndInstall: () => Promise<void>
        onUpdateMessage: (callback: (message: string) => void) => void
        onUpdateAvailable: (callback: (info: any) => void) => void
        onUpdateNotAvailable: (callback: (info: any) => void) => void
        onUpdateError: (callback: (error: string) => void) => void
        onDownloadProgress: (callback: (progress: any) => void) => void
        onUpdateDownloaded: (callback: (info: any) => void) => void
    }
  }
}

const DB_TYPES = {
  mysql: [
    'INT', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'DATETIME', 'TIMESTAMP', 
    'DECIMAL(10,2)', 'TINYINT', 'JSON', 'BLOB'
  ],
  postgresql: [
    'INTEGER', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'TIMESTAMP', 'BOOLEAN',
    'NUMERIC', 'JSONB', 'UUID', 'BYTEA'
  ],
  sqlite: [
    'INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'
  ]
};

// Prism SQL 样式覆盖
const editorStyles = `
  .sql-editor-container pre {
    background: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .sql-editor-container textarea {
    caret-color: #000 !important;
    outline: none !important;
    color: transparent !important;
    background: transparent !important;
    -webkit-text-fill-color: transparent !important;
  }
  .ai-selection-input textarea {
    color: #000 !important;
    -webkit-text-fill-color: #000 !important;
  }
  .sql-editor-container pre {
    pointer-events: none !important;
  }
  .token.keyword { color: #2563eb; font-weight: bold; }
  .token.string { color: #059669; }
  .token.comment { color: #94a3b8; font-style: italic; }
  .token.number { color: #d97706; }
  .token.punctuation { color: #64748b; }
  .token.function { color: #7c3aed; }
  .token.operator { color: #475569; }
  /* Redis 高亮 */
  .token.redis-command { color: #dc2626; font-weight: bold; text-transform: uppercase; }
  .token.redis-key { color: #7c3aed; }
`;

// Context Menu Component
const ContextMenu: React.FC<{
  x: number;
  y: number;
  options: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[];
  onClose: () => void;
}> = ({ x, y, options, onClose }) => {
  useEffect(() => {
    const handleClick = () => onClose();
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{ top: y, left: x }}
      className="fixed z-[100] bg-white border border-slate-200 rounded-xl shadow-2xl py-1.5 min-w-[160px] overflow-hidden"
    >
      {options.map((opt, i) => (
        <button
          key={i}
          onClick={(e) => {
            e.stopPropagation();
            opt.onClick();
            onClose();
          }}
          className={`w-full px-4 py-2 text-sm text-left flex items-center gap-3 transition-colors ${
            opt.danger 
              ? 'text-red-500 hover:bg-red-50' 
              : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'
          }`}
        >
          {opt.icon}
          <span className="font-medium">{opt.label}</span>
        </button>
      ))}
    </motion.div>
  );
};

// Global Toast Component
const Toast: React.FC<{
  message: string;
  type?: 'error' | 'success' | 'info';
  onClose: () => void;
}> = ({ message, type = 'error', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    error: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  const icons = {
    error: <X className="w-5 h-5 text-red-500" />,
    success: <RefreshCw className="w-5 h-5 text-emerald-500" />,
    info: <Activity className="w-5 h-5 text-blue-500" />
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, x: '-50%' }}
      animate={{ opacity: 1, y: 20, x: '-50%' }}
      exit={{ opacity: 0, y: -20, x: '-50%' }}
      className={`fixed top-0 left-1/2 z-[200] px-4 py-3 rounded-xl border shadow-xl flex items-center gap-3 min-w-[320px] max-w-[90vw] ${colors[type]}`}
    >
      <div className="flex-shrink-0">
        {icons[type]}
      </div>
      <div className="flex-grow text-sm font-medium leading-relaxed">
        {message}
      </div>
      <button 
        onClick={onClose}
        className="flex-shrink-0 p-1 hover:bg-black/5 rounded-lg transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

// Custom Confirm Modal Component
const ConfirmModal: React.FC<{
  show: boolean;
  title: string;
  message: string;
  type?: 'warning' | 'danger' | 'info';
  buttons?: { label: string; onClick: () => void; variant?: 'primary' | 'secondary' | 'danger' }[];
  onConfirm?: () => void;
  onCancel: () => void;
}> = ({ show, title, message, type = 'warning', buttons, onConfirm, onCancel }) => {
  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-[400px] overflow-hidden z-10"
          >
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-slate-50 to-transparent">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  type === 'danger' ? 'bg-red-50 text-red-500' : 
                  type === 'warning' ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-500'
                }`}>
                  <Settings size={16} />
                </div>
                <h3 className="font-bold text-lg text-slate-900 tracking-tight">{title}</h3>
              </div>
              <motion.button 
                whileHover={{ rotate: 90, scale: 1.1 }}
                onClick={onCancel} 
                className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
              >
                <X size={16} />
              </motion.button>
            </div>
            
            {/* Content */}
            <div className="p-8">
              <p className="text-slate-600 text-sm leading-relaxed font-medium">{message}</p>
            </div>

            {/* Actions */}
            <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex gap-3">
              {buttons ? (
                buttons.map((btn, i) => (
                  <motion.button
                    key={i}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      btn.onClick();
                      onCancel();
                    }}
                    className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all ${
                      btn.variant === 'primary' ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-200' :
                      btn.variant === 'danger' ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200' :
                      'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                    }`}
                  >
                    {btn.label}
                  </motion.button>
                ))
              ) : (
                <>
                  <button 
                    onClick={onCancel}
                    className="flex-1 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 transition-all"
                  >
                    取消
                  </button>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      onConfirm?.();
                      onCancel();
                    }}
                    className={`flex-1 py-3 rounded-2xl text-sm font-bold text-white shadow-lg transition-all ${
                      type === 'danger' ? 'bg-red-500 hover:bg-red-600 shadow-red-200' : 
                      type === 'warning' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200' : 'bg-blue-500 hover:bg-blue-600 shadow-blue-200'
                    }`}
                  >
                    确定
                  </motion.button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// 辅助函数：判断是否为时间类型并返回 input 类型
const getTimeInputType = (type: string): 'datetime-local' | 'date' | 'time' | null => {
  if (!type) return null;
  const t = type.toUpperCase();
  if (t.includes('DATETIME') || t.includes('TIMESTAMP')) return 'datetime-local';
  if (t.includes('DATE')) return 'date';
  if (t.includes('TIME')) return 'time';
  return null;
};

// 辅助函数：格式化时间值为 input 要求的格式
const formatTimeForInput = (value: any, inputType: string) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value.toString();

    const pad = (n: number) => n.toString().padStart(2, '0');
    if (inputType === 'datetime-local') {
      // YYYY-MM-DDTHH:mm
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    } else if (inputType === 'date') {
      // YYYY-MM-DD
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    } else if (inputType === 'time') {
      // HH:mm
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
  } catch (e) {
    return value.toString();
  }
  return value.toString();
};

const App: React.FC = () => {
  // State for connections
  const [savedConnections, setSavedConnections] = useState<ConnectionConfig[]>([])
  const [activeConnection, setActiveConnection] = useState<ConnectionConfig | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [isEditingConnection, setIsEditingConnection] = useState(false)
  const [expandedConnections, setExpandedConnections] = useState<Set<number>>(new Set())
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set())
  const [newConfig, setNewConfig] = useState<ConnectionConfig>({
    name: '',
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: ''
  })

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

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'table' | 'database' | 'row' | 'console', target: string } | null>(null);
  
  // Modals State
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showConsoleRenameModal, setShowConsoleRenameModal] = useState(false);
  const [renameData, setRenameData] = useState({ oldName: '', newName: '' });
  const [consoleRenameData, setConsoleRenameData] = useState({ id: '', name: '' });
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [schemaData, setSchemaData] = useState<{ tableName: string; columns: any[]; indexes: any[] }>({ tableName: '', columns: [], indexes: [] });
  const [activeSchemaTab, setActiveSchemaTab] = useState<'columns' | 'indexes'>('columns');
  const [textDetail, setTextDetail] = useState<{ content: any; fieldName: string } | null>(null)
  const [isJsonFormatted, setIsJsonFormatted] = useState(false);
  const [rowLimit, setRowLimit] = useState(10000); // 新增：大数据量限制行数
  const [useVirtualScroll, setUseVirtualScroll] = useState(true); // 是否开启虚拟滚动
  const [viewportHeight, setViewportHeight] = useState(0); // 视口高度
  const ROW_HEIGHT = 48; // 预估行高

  // JSON Helper Functions
  const isJsonLike = (val: any) => {
    if (val === null || val === undefined) return false;
    if (typeof val === 'object') return true;
    if (typeof val !== 'string') return false;
    if (!val.trim().startsWith('{') && !val.trim().startsWith('[')) return false;
    try {
      const result = JSON.parse(val);
      return (typeof result === 'object' && result !== null) || Array.isArray(result);
    } catch (e) {
      return false;
    }
  };

  const formatJson = (val: any) => {
    try {
      if (typeof val === 'string') {
        return JSON.stringify(JSON.parse(val), null, 2);
      }
      return JSON.stringify(val, null, 2);
    } catch (e) {
      return String(val);
    }
  };
  
  // Pagination State
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [tableExecutionTime, setTableExecutionTime] = useState<number | null>(null); // 新增：表格查询耗时
  
  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: 'ASC' | 'DESC' | null }>({ column: '', direction: null });

  // Query Console State
  interface ConsoleTab {
    id: string;
    connectionId?: number;
    name: string;
    sql: string;
    results?: any[];
    columns?: string[];
    executing: boolean;
    error?: string;
    dbName?: string;
    tableName?: string; // 新增：表名上下文
    isDirty?: boolean;
    savedSql?: string;
    currentPage?: number;
    pageSize?: number;
    executionTime?: number; // 新增：执行耗时 (ms)
    hasMore?: boolean;      // 是否还有更多数据
    isAutoLimited?: boolean; // 是否被自动限制了行数
    totalCount?: number;     // 当前获取的数据条数
  }
  const [consoles, setConsoles] = useState<ConsoleTab[]>([]);
  const [activeConsoleId, setActiveConsoleId] = useState<string | null>(null);

  // Layout State
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [resultsHeight, setResultsHeight] = useState(300);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingResults, setIsResizingResults] = useState(false);

  // Persistence logic for consoles
  const loadConsoles = async (connectionId?: number) => {
    try {
      const savedConsoles = await window.electronAPI.getConsoles(connectionId);
      const mappedConsoles: ConsoleTab[] = savedConsoles.map((c: any) => ({
        ...c,
        executing: false,
        isDirty: false,
        savedSql: c.sql
      }));
      setConsoles(mappedConsoles);
      if (mappedConsoles.length > 0 && !activeConsoleId) {
        setActiveConsoleId(mappedConsoles[0].id);
      }
    } catch (err) {
      console.error('Failed to load consoles:', err);
    }
  };

  const handleSaveConsole = async (id: string, customName?: string) => {
    const consoleTab = consoles.find(c => c.id === id);
    if (!consoleTab) return;

    const nameToSave = customName || consoleTab.name;

    try {
      await window.electronAPI.saveConsole({
        id: consoleTab.id,
        connectionId: activeConnection?.id,
        name: nameToSave,
        sql: consoleTab.sql,
        dbName: consoleTab.dbName
      });
      
      setConsoles(prev => prev.map(c => 
        c.id === id ? { ...c, name: nameToSave, isDirty: false, savedSql: c.sql } : c
      ));
      setToast({ message: '保存成功', type: 'success' });
    } catch (err: any) {
      setToast({ message: `保存失败: ${err.message}`, type: 'error' });
    }
  };

  const handleCloseConsole = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const tab = consoles.find(c => c.id === id);
    if (!tab) return;

    if (tab.isDirty) {
      confirm({
        title: '保存修改',
        message: `控制台 "${tab.name}" 有未保存的修改，是否保存？`,
        type: 'info',
        buttons: [
          { 
            label: '保存', 
            variant: 'primary',
            onClick: async () => {
              await handleSaveConsole(id);
              performClose(id);
            } 
          },
          { 
            label: '不保存', 
            variant: 'danger',
            onClick: () => performClose(id)
          },
          { 
            label: '取消', 
            variant: 'secondary',
            onClick: () => {} 
          }
        ]
      });
      return;
    }

    performClose(id);
  };

  const performClose = (id: string) => {
    const newConsoles = consoles.filter(c => c.id !== id);
    setConsoles(newConsoles);
    if (activeConsoleId === id) {
      setActiveConsoleId(newConsoles.length > 0 ? newConsoles[0].id : null);
    }
  };

  // AI State
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiLoading, setAILoading] = useState(false);
  const [aiPrompt, setAIPrompt] = useState('');
  const [aiMessages, setAIMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [aiContext, setAIContext] = useState<{ type: 'database' | 'table', name: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [apiKey, setApiKey] = useState('');

  // Auto Update State
  const [updateStatus, setUpdateStatus] = useState<{
    type: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'not-available';
    message?: string;
    progress?: number;
    info?: any;
  }>({ type: 'idle' });
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // AI SQL Selection feature states
  const [selectedSql, setSelectedSql] = useState<string>('');
  const [selectionRange, setSelectionRange] = useState<{ start: number, end: number } | null>(null);
  const [showAISelectionInput, setShowAISelectionInput] = useState(false);
  const [aiSelectionPrompt, setAISelectionPrompt] = useState('');
  const [aiSelectionLoading, setAISelectionLoading] = useState(false);
  const [selectionPosition, setSelectionPosition] = useState<{ x: number, y: number } | null>(null);
  const aiPopupRef = React.useRef<HTMLDivElement>(null);
  const suggestionRef = React.useRef<HTMLDivElement>(null);
  const suggestionListRef = React.useRef<HTMLDivElement>(null);

  // Autocomplete State
  const [suggestionInfo, setSuggestionInfo] = useState<{
    show: boolean;
    list: string[];
    index: number;
    x: number;
    y: number;
    word: string;
    start: number;
  }>({ show: false, list: [], index: 0, x: 0, y: 0, word: '', start: 0 });

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

  // Data Editing State
  const [editingCells, setEditingCells] = useState<{[rowIdx: number]: {[colName: string]: any}}>({});
  const [deletedRows, setDeletedRows] = useState<Set<number>>(new Set());
  const [editOriginalData, setEditOriginalData] = useState<any[]>([]); // 用于比对变更
  const [editingCellCoord, setEditingCellCoord] = useState<{rowIdx: number, colName: string} | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMatches, setSearchMatches] = useState<{rowIdx: number, colName: string}[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(-1);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const tableContainerRef = React.useRef<HTMLDivElement>(null);
  const resultsContainerRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0); // 记录滚动位置
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const [showResultsScrollButtons, setShowResultsScrollButtons] = useState(false);

  // Load Saved Consoles Modal State
  const [showLoadConsoleModal, setShowLoadConsoleModal] = useState(false);
  const [savedConsoles, setSavedConsoles] = useState<any[]>([]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const newWidth = Math.max(200, Math.min(600, e.clientX));
        setSidebarWidth(newWidth);
      } else if (isResizingResults) {
        const newHeight = Math.max(100, Math.min(window.innerHeight - 200, window.innerHeight - e.clientY));
        setResultsHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      setIsResizingResults(false);
      document.body.style.cursor = 'default';
    };

    if (isResizingSidebar || isResizingResults) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isResizingSidebar ? 'col-resize' : 'row-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar, isResizingResults]);

  useEffect(() => {
    setSuggestionInfo(prev => ({ ...prev, show: false }));
  }, [activeConsoleId, activeConnection]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
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
  }, [selectedTable, activeConsoleId, consoles]);

  // 点击外部关闭弹窗逻辑
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // AI 智能修改弹窗
      if (showAISelectionInput && aiPopupRef.current && !aiPopupRef.current.contains(event.target as Node)) {
        setShowAISelectionInput(false);
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
    loadSettings()
    
    // 获取应用版本
    window.electronAPI.getAppVersion().then(setAppVersion);

    // 注册更新监听器
    window.electronAPI.onUpdateMessage((message) => {
      setUpdateStatus(prev => ({ ...prev, message }));
    });

    window.electronAPI.onUpdateAvailable((info) => {
      setUpdateStatus({ type: 'available', info, message: `新版本 v${info.version} 已就绪` });
      setShowUpdateModal(true);
    });

    window.electronAPI.onUpdateNotAvailable((info) => {
      setUpdateStatus({ type: 'not-available', message: '当前已是最新版本' });
    });

    window.electronAPI.onDownloadProgress((progress) => {
      setUpdateStatus(prev => ({ 
        ...prev, 
        type: 'downloading', 
        progress: progress.percent,
        message: `正在下载: ${Math.round(progress.percent)}%`
      }));
    });

    window.electronAPI.onUpdateDownloaded((info) => {
      setUpdateStatus({ type: 'downloaded', info, message: '更新下载完成，准备重启安装' });
    });

    window.electronAPI.onUpdateError((error) => {
      setUpdateStatus({ type: 'error', message: `更新出错: ${error}` });
    });
  }, [])

  const handleCheckUpdates = async () => {
    setUpdateStatus({ type: 'checking', message: '正在检查更新...' });
    await window.electronAPI.checkForUpdates();
  };

  const handleDownloadUpdate = async () => {
    setUpdateStatus(prev => ({ ...prev, type: 'downloading', message: '开始下载更新...' }));
    await window.electronAPI.downloadUpdate();
  };

  const handleInstallUpdate = async () => {
    await window.electronAPI.quitAndInstall();
  };

  // 搜索逻辑
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchMatches([]);
      setCurrentMatchIdx(-1);
      return;
    }

    const matches: {rowIdx: number, colName: string}[] = [];
    const term = searchTerm.toLowerCase();

    // 根据当前视图选择搜索数据源
    let searchData: any[] = [];
    let searchColumns: any[] = [];

    if (activeConsoleId) {
      const activeConsole = consoles.find(c => c.id === activeConsoleId);
      if (activeConsole && activeConsole.results) {
        searchData = activeConsole.results;
        searchColumns = activeConsole.columns?.map(c => ({ name: c })) || [];
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
  }, [searchTerm, data, columns, activeConsoleId, consoles]);

  // 定位到当前匹配项
  useEffect(() => {
    if (currentMatchIdx >= 0 && searchMatches[currentMatchIdx]) {
      const { rowIdx, colName } = searchMatches[currentMatchIdx];
      
      // 如果是在控制台视图，且匹配项不在当前页，则切换页面
      if (activeConsoleId) {
        const activeConsole = consoles.find(c => c.id === activeConsoleId);
        if (activeConsole && activeConsole.results) {
          const size = activeConsole.pageSize || 50;
          const matchPage = Math.floor(rowIdx / size) + 1;
          if (activeConsole.currentPage !== matchPage) {
            setConsoles(prev => prev.map(c => c.id === activeConsoleId ? { ...c, currentPage: matchPage } : c));
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
  const handleContainerScroll = (e: React.UIEvent<HTMLDivElement>, type: 'table' | 'results' = 'table') => {
    const target = e.currentTarget;
    if (type === 'table') {
      // 表格视图滚动超过 300px 时显示按钮
      setShowScrollButtons(target.scrollTop > 300);
    } else {
      // 查询结果视图滚动超过 100px 时显示按钮
      setShowResultsScrollButtons(target.scrollTop > 100);
      setScrollTop(target.scrollTop);
      if (viewportHeight !== target.clientHeight) {
        setViewportHeight(target.clientHeight);
      }
    }
  };

  useEffect(() => {
     setSelectedSql('');
     setSelectionRange(null);
     setSelectionPosition(null);
     setShowAISelectionInput(false);
   }, [activeConsoleId]);

  const loadSettings = async () => {
    const savedKey = await window.electronAPI.getSetting('deepseek_api_key');
    if (savedKey) setApiKey(savedKey);
  }

  const handleSaveSettings = async () => {
    await window.electronAPI.saveSetting('deepseek_api_key', apiKey);
    setShowSettings(false);
  }

  const loadSavedConnections = async () => {
    const connections = await window.electronAPI.getSavedConnections()
    setSavedConnections(connections)
  }

  const handleSaveConnection = async () => {
    if (!newConfig.name) return
    await window.electronAPI.saveConnection(newConfig)
    setShowAddModal(false)
    setIsEditingConnection(false)
    loadSavedConnections()
  }

  const handleEditConnection = (conn: ConnectionConfig, e: React.MouseEvent) => {
    e.stopPropagation()
    setNewConfig({ ...conn })
    setIsEditingConnection(true)
    setShowAddModal(true)
  }

  const handleDeleteConnection = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    confirm({
      title: '删除连接',
      message: '确定要删除这个连接吗？',
      type: 'danger',
      onConfirm: async () => {
        await window.electronAPI.deleteConnection(id)
        loadSavedConnections()
        // 如果删除的是当前活跃连接，清空状态
        if (activeConnection?.id === id) {
          setActiveConnection(null)
          setDatabases([])
          setSelectedDatabase(null)
          setTables([])
        }
      }
    });
  }

  const loadDatabases = async (forceConfig?: ConnectionConfig) => {
    if (!activeConnection && !forceConfig) return;
    try {
      const dbList = await window.electronAPI.getDatabases();
      setDatabases(dbList);
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  }

  const handleConnect = async (config: ConnectionConfig) => {
    // 切换折叠状态
    const isExpanding = !expandedConnections.has(config.id!);
    const newExpanded = new Set(expandedConnections)
    if (newExpanded.has(config.id!)) {
      newExpanded.delete(config.id!)
      setExpandedConnections(newExpanded)
      return
    } else {
      newExpanded.add(config.id!)
      setExpandedConnections(newExpanded)
    }

    setLoading(true)
    setDatabases([]) // 清空旧的数据库列表，触发加载状态
    try {
      const result = await window.electronAPI.connectDB(config)
      if (result.success) {
        setActiveConnection(config)
        
        // 如果是展开操作，确保数据库列表已加载
        // 直接调用 loadDatabases 并传递 config，绕过 activeConnection 状态可能尚未更新的问题
        if (isExpanding) {
          await loadDatabases(config);
        }
        
        // Load consoles for this connection
        await loadConsoles(config.id);
        
        // 如果配置中已经指定了数据库，则自动选择
        if (config.type === 'sqlite') {
          handleSelectDatabase('main')
        } else if (config.database) {
          handleSelectDatabase(config.database)
        } else {
          setSelectedDatabase(null)
          setTables([])
        }

        setSelectedTable(null)
        setData([])
        setColumns([])
      } else {
        setToast({ message: result.error || '连接失败', type: 'error' })
      }
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' })
    } finally {
      setLoading(false)
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
    try {
      const offset = (page - 1) * size;
      const startTime = Date.now();
      const [cols, dataRes] = await Promise.all([
        window.electronAPI.getTableColumns(tableName),
        window.electronAPI.getTableData(tableName, size, offset, sortCol || undefined, sortDir || undefined)
      ])
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

  const handleSort = (columnName: string) => {
    let nextDir: 'ASC' | 'DESC' | null = 'ASC';
    
    if (sortConfig.column === columnName) {
      if (sortConfig.direction === 'ASC') nextDir = 'DESC';
      else if (sortConfig.direction === 'DESC') nextDir = null;
    }

    setSortConfig({ column: nextDir ? columnName : '', direction: nextDir });
    handleSelectTable(selectedTable!, 1, pageSize, nextDir ? columnName : '', nextDir);
  };

  const stripSqlComments = (sql: string) => {
    if (!sql) return '';
    
    // 1. 移除多行注释 /* ... */
    let cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // 2. 移除单行注释 -- 或 # 或 //
    // 注意：这里简单处理，不考虑字符串内部的情况
    cleaned = cleaned.split('\n').map(line => {
      // 匹配 -- 或 # 或 // 开头的注释，但要排除它们出现在引号内的情况（简单处理）
      const dashIndex = line.indexOf('--');
      const hashIndex = line.indexOf('#');
      const doubleSlashIndex = line.indexOf('//');
      
      const indices = [dashIndex, hashIndex, doubleSlashIndex].filter(i => i !== -1);
      let commentIndex = indices.length > 0 ? Math.min(...indices) : -1;
      
      if (commentIndex !== -1) {
        return line.substring(0, commentIndex);
      }
      return line;
    }).join('\n');
    
    return cleaned.trim();
  };

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

    let startTime = Date.now();
    setConsoles(prev => prev.map(c => c.id === id ? { ...c, executing: true, error: undefined, executionTime: undefined } : c));
    try {
      // 如果控制台指定了数据库且当前未切换到该库，则先切换
      if (consoleTab.dbName && consoleTab.dbName !== selectedDatabase) {
        await window.electronAPI.useDatabase(consoleTab.dbName);
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

  const handleNewConsole = (dbName: string, tableName?: string) => {
    const isRedis = activeConnection?.type === 'redis';
    let baseName = '';
    
    if (tableName) {
      baseName = isRedis ? `命令 - ${tableName}` : `查询 - ${tableName}`;
    } else {
      baseName = isRedis ? `命令 - DB ${dbName}` : `查询 - ${dbName}`;
    }
    
    // 生成唯一名称
    let uniqueName = baseName;
    let counter = 1;
    while (consoles.some(c => c.name === uniqueName)) {
      uniqueName = `${baseName} ${counter}`;
      counter++;
    }

    const id = Math.random().toString(36).substr(2, 9);
    const newConsole: ConsoleTab = {
      id,
      connectionId: activeConnection?.id,
      name: uniqueName,
      sql: isRedis ? 'KEYS *' : (tableName ? `SELECT * FROM \`${tableName}\` LIMIT 100;` : ''),
      executing: false,
      dbName: dbName,
      tableName: tableName,
      isDirty: true,
      savedSql: '',
      currentPage: 1,
      pageSize: 50
    };
    setConsoles([...consoles, newConsole]);
    setActiveConsoleId(id);
    setSelectedTable(null);
    setContextMenu(null);
  }

  const handleDeleteConsole = async (id: string) => {
    const tab = consoles.find(c => c.id === id);
    if (!tab) return;

    confirm({
      title: '从本地删除',
      message: `确定要从本地数据库中永久删除控制台 "${tab.name}" 吗？`,
      type: 'danger',
      onConfirm: async () => {
        try {
          await window.electronAPI.deleteConsole(id);
          performClose(id);
          setToast({ message: '已从本地删除', type: 'success' });
        } catch (err: any) {
          setToast({ message: `删除失败: ${err.message}`, type: 'error' });
        }
      }
    });
  }

  const handleRenameConsole = async () => {
    if (!consoleRenameData.name.trim()) return;
    
    setConsoles(prev => prev.map(c => 
      c.id === consoleRenameData.id ? { ...c, name: consoleRenameData.name, isDirty: true } : c
    ));
    
    setShowConsoleRenameModal(false);
  }

  const handleOpenLoadConsoleModal = async () => {
    try {
      const allSaved = await window.electronAPI.getConsoles(activeConnection?.id);
      setSavedConsoles(allSaved);
      setShowLoadConsoleModal(true);
    } catch (err: any) {
      setToast({ message: `加载失败: ${err.message}`, type: 'error' });
    }
  };

  const handleRestoreConsole = (savedTab: any) => {
    // 检查是否已在当前标签页中
    if (consoles.some(c => c.id === savedTab.id)) {
      setActiveConsoleId(savedTab.id);
    } else {
      setConsoles(prev => [...prev, { ...savedTab, isDirty: false, savedSql: savedTab.sql }]);
      setActiveConsoleId(savedTab.id);
    }
    setShowLoadConsoleModal(false);
  };

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

  // Handle data cell edit start
  const handleCellDoubleClick = (rowIdx: number, colName: string, value: any) => {
    // Redis 仅支持修改 key, value, ttl，不支持修改 type
    if (activeConnection?.type === 'redis' && colName === 'type') {
      setToast({ message: 'Redis 数据类型由其内容决定，无法直接修改。', type: 'info' });
      return;
    }

    const col = columns.find(c => c.name === colName);
    const timeInputType = col ? getTimeInputType(col.type) : null;

    setEditingCellCoord({ rowIdx, colName });

    if (timeInputType && value) {
      setEditValue(formatTimeForInput(value, timeInputType));
    } else {
      setEditValue(value === null ? '' : value.toString());
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
      const col = columns.find(c => c.name === colName);
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
    
    // 检查是否真的有变化
    const originalValue = editOriginalData[rowIdx][colName];
    
    let isChanged = false;
    if (originalValue === null) {
      isChanged = finalValue !== null;
    } else if (finalValue === null) {
      isChanged = originalValue !== null;
    } else {
      // 时间字符串比对时，可能需要归一化，但目前简单字符串比对能处理大部分情况
      isChanged = finalValue.toString() !== originalValue.toString();
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
  };

  const formatSqlValue = (val: any) => {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return val;
    return `'${val.toString().replace(/'/g, "''")}'`;
  };

  const formatRedisValue = (val: any) => {
    if (val === null || val === undefined) return '""';
    return `"${val.toString().replace(/"/g, '\\"')}"`;
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
      const primaryKeyCols = columns.filter(c => c.primaryKey).map(c => c.name);
      
      if (primaryKeyCols.length === 0) {
        setToast({ message: '无法提交更改：该表没有主键，无法精确定位行。', type: 'error' });
        return;
      }

      const quote = activeConnection.type === 'mysql' ? '`' : '"';

      // 1. 处理删除
      for (const rowIdx of Array.from(deletedRows)) {
        const rowData = editOriginalData[rowIdx];
        const whereClause = primaryKeyCols.map(pk => `${quote}${pk}${quote} = ${formatSqlValue(rowData[pk])}`).join(' AND ');
        sqls.push(`DELETE FROM ${quote}${selectedTable}${quote} WHERE ${whereClause}`);
      }

      // 2. 处理修改
      for (const rowIdxStr in editingCells) {
        const rowIdx = parseInt(rowIdxStr);
        if (deletedRows.has(rowIdx)) continue;

        const rowEdits = editingCells[rowIdx];
        const rowData = editOriginalData[rowIdx];
        const setClause = Object.entries(rowEdits).map(([col, val]) => `${quote}${col}${quote} = ${formatSqlValue(val)}`).join(', ');
        const whereClause = primaryKeyCols.map(pk => `${quote}${pk}${quote} = ${formatSqlValue(rowData[pk])}`).join(' AND ');
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

  const handleOpenAIModal = async (type: 'database' | 'table', name: string) => {
    setAIContext({ type, name });
    setAIMessages([]);
    setAIPrompt('');
    setShowAIModal(true);
    setContextMenu(null);
  }

  const handleAIChat = async () => {
    if (!aiPrompt.trim() || aiLoading) return;

    const userMsg = aiPrompt;
    setAIPrompt('');
    setAIMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setAILoading(true);

    try {
      // 准备上下文信息
      let schemaInfo = '';
      if (aiContext?.type === 'table') {
        const cols = await window.electronAPI.getTableColumns(aiContext.name);
        schemaInfo = `当前表: ${aiContext.name}\n结构:\n${cols.map(c => `${c.name} (${c.type})`).join(', ')}`;
      } else if (aiContext?.type === 'database') {
        const tables = await window.electronAPI.getTables();
        const schemaPromises = tables.map(async (t) => {
          const cols = await window.electronAPI.getTableColumns(t.name);
          return `${t.name} (${cols.map(c => `${c.name} ${c.type}`).join(', ')})`;
        });
        const schemas = await Promise.all(schemaPromises);
        schemaInfo = `当前数据库: ${aiContext.name}\n完整结构:\n${schemas.join('\n')}`;
      }

      const messages = [
        { 
          role: 'system', 
          content: `你是一个专业的 SQL 专家。
当前数据库类型: ${activeConnection?.type}
${schemaInfo}

**重要准则：**
1. **严禁假设**：你必须严格基于上方提供的“完整结构”进行 SQL 编写。严禁捏造不存在的表名或字段名。
2. **准确性**：如果用户的需求涉及到的表或字段在结构中找不到，请直接指出缺失信息，不要尝试猜测。
3. **多表关联**：如果需要关联查询，请根据结构中的字段名进行逻辑关联。
4. **输出规范**：请直接给出 SQL 代码块，并附带简要说明。如果是查询请求，请尽量生成完整的 SELECT 语句。`
        },
        ...aiMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMsg }
      ];

      const res = await window.electronAPI.aiChat(messages);
      if (res.success && res.response) {
        setAIMessages(prev => [...prev, { role: 'assistant', content: res.response! }]);
      } else {
        setToast({ message: res.error || 'AI 响应失败', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setAILoading(false);
    }
  }

  const handleApplyAISQL = (content: string) => {
    // 提取 SQL 代码块
    const sqlMatch = content.match(/```sql\n([\s\S]*?)\n```/) || content.match(/```([\s\S]*?)\n```/);
    const sql = sqlMatch ? sqlMatch[1] : content;

    if (activeConsoleId) {
      setConsoles(prev => prev.map(c => c.id === activeConsoleId ? { ...c, sql: sql } : c));
      setShowAIModal(false);
    } else {
      // 如果没有活跃的控制台，新建一个
      const id = Math.random().toString(36).substr(2, 9);
      const newConsole: ConsoleTab = {
        id,
        connectionId: activeConnection?.id,
        name: `AI 生成 - ${aiContext?.name || '查询'}`,
        sql: sql,
        executing: false,
        dbName: selectedDatabase || undefined,
        tableName: aiContext?.type === 'table' ? aiContext.name : undefined,
        isDirty: true,
        savedSql: ''
      };
      setConsoles([...consoles, newConsole]);
      setActiveConsoleId(id);
      setShowAIModal(false);
    }
  }

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
        const selectedTable = suggestionInfo.list[suggestionInfo.index];
        insertSuggestion(selectedTable);
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
      
      // 过滤表名
      const filtered = tables
        .map(t => t.name)
        .filter(name => name.toLowerCase().includes(word) && name.toLowerCase() !== word)
        .slice(0, 50); // 增加建议数量，更接近 IDEA 体验

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

  const handleSelection = (e?: React.MouseEvent | React.KeyboardEvent) => {
    // 延迟执行以确保 selection 已经更新
    setTimeout(() => {
      const textarea = document.querySelector('.sql-editor-container textarea') as HTMLTextAreaElement;
      if (textarea && textarea.selectionStart !== textarea.selectionEnd) {
        const selected = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
        setSelectedSql(selected);
        setSelectionRange({ start: textarea.selectionStart, end: textarea.selectionEnd });
        
        // 计算选中内容第一个字符的位置
        const container = document.querySelector('.sql-editor-container');
        if (container) {
          const rect = container.getBoundingClientRect();
          
          // 创建一个隐藏的 div 来模拟 textarea 内容并计算坐标
          const div = document.createElement('div');
          const style = window.getComputedStyle(textarea);
          
          // 复制 textarea 的样式
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
          
          // 获取 selectionStart 之前的文本
          const textBefore = textarea.value.substring(0, textarea.selectionStart);
          const span = document.createElement('span');
          span.textContent = textBefore;
          div.appendChild(span);
          
          // 插入一个标记元素来获取坐标
          const marker = document.createElement('span');
          marker.textContent = '|';
          div.appendChild(marker);
          
          document.body.appendChild(div);
          
          const markerRect = marker.getBoundingClientRect();
          const divRect = div.getBoundingClientRect();
          
          // 计算相对容器的位置，并加上滚动偏移
          setSelectionPosition({
            x: markerRect.left - divRect.left + textarea.offsetLeft - textarea.scrollLeft,
            y: markerRect.top - divRect.top + textarea.offsetTop - textarea.scrollTop
          });
          
          document.body.removeChild(div);
        }
      } else {
        // 如果没有选中，或者点击了其他地方，只有在 AI 输入框没打开的时候才清除
        if (!showAISelectionInput) {
          setSelectedSql('');
          setSelectionRange(null);
          setSelectionPosition(null);
        }
      }
    }, 0);
  };

  const handleAISelectionSubmit = async () => {
    if (!aiSelectionPrompt.trim() || aiSelectionLoading || !selectedSql) return;

    setAISelectionLoading(true);
    try {
      const activeConsole = consoles.find(c => c.id === activeConsoleId);
      
      // 获取当前数据库的所有表和结构
      let schemaContext = '';
      try {
        if (activeConsole?.tableName) {
          // 如果控制台绑定了表，只获取该表的结构
          const cols = await window.electronAPI.getTableColumns(activeConsole.tableName);
          schemaContext = `当前表: ${activeConsole.tableName}\n结构:\n${cols.map(c => `${c.name} (${c.type})`).join(', ')}`;
        } else {
          // 否则获取当前数据库的所有表结构
          const tableList = await window.electronAPI.getTables();
          const schemaPromises = tableList.map(async (t) => {
            const cols = await window.electronAPI.getTableColumns(t.name);
            return `${t.name} (${cols.map(c => `${c.name} ${c.type}`).join(', ')})`;
          });
          const schemas = await Promise.all(schemaPromises);
          schemaContext = schemas.length > 0 ? `当前数据库完整结构:\n${schemas.join('\n')}` : '（未获取到数据库结构）';
        }
      } catch (err) {
        console.error('Failed to fetch schema for AI:', err);
      }

      const prompt = `
你是一个 SQL 专家。
当前数据库类型: ${activeConnection?.type || '未知'}
${schemaContext}

**严格指令：**
1. **禁止幻想**：你必须严格使用上方提供的真实数据库结构。严禁使用任何不存在的表名或字段名。
2. **准确修改**：如果用户的指令是修改 SQL，请结合提供的结构信息，确保修改后的 SQL 字段名和表名完全匹配真实数据库。
3. **拒绝猜测**：如果指令涉及到的信息在提供的结构中不存在，请告知用户你无法根据当前结构完成该操作，而不是自行假设。

当前选中的 SQL 代码如下：
\`\`\`sql
${selectedSql}
\`\`\`

用户的指令是：${aiSelectionPrompt}

请只返回修改后的 SQL 代码块（包裹在 \`\`\`sql ... \`\`\` 中），或者针对结构给出专业的建议。
`;

      const result = await window.electronAPI.aiChat([
        { role: 'user', content: prompt }
      ]);

      if (result.success && result.response) {
        // 解析返回的内容
        const sqlMatch = result.response.match(/```sql\n([\s\S]*?)\n```/) || result.response.match(/```([\s\S]*?)\n```/);
        
        if (sqlMatch) {
          const newSql = sqlMatch[1];
          // 替换选中的内容
          if (selectionRange && activeConsoleId) {
            setConsoles(prev => prev.map(c => {
              if (c.id === activeConsoleId) {
                const fullSql = c.sql;
                const updatedSql = fullSql.substring(0, selectionRange.start) + newSql + fullSql.substring(selectionRange.end);
                return { ...c, sql: updatedSql };
              }
              return c;
            }));
          }
          setShowAISelectionInput(false);
          setAISelectionPrompt('');
          setSelectedSql('');
          setSelectionRange(null);
        } else {
          // 如果不是 SQL 块，可能只是建议，显示在 Toast
          setToast({ message: result.response, type: 'info' });
          setShowAISelectionInput(false);
        }
      } else {
        setToast({ message: result.error || 'AI 响应失败', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setAISelectionLoading(false);
    }
  };

  const handleConsoleDBChange = async (id: string, dbName: string) => {
    setConsoles(prev => prev.map(c => c.id === id ? { ...c, dbName } : c));
    if (dbName !== selectedDatabase) {
      await window.electronAPI.useDatabase(dbName);
      setSelectedDatabase(dbName);
      const tableList = await window.electronAPI.getTables();
      setTables(tableList);
    }
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

  const handleTableContextMenu = (e: React.MouseEvent, tableName: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'table', target: tableName });
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
              oc.autoIncrement !== m.column.autoIncrement
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

  const totalPages = Math.ceil(totalRows / pageSize);

  return (
    <div className="flex h-screen bg-[#f8fafc] text-slate-700 font-sans selection:bg-blue-100 overflow-hidden">
      <style>{editorStyles}</style>
      {/* Sidebar */}
      <motion.div 
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        style={{ width: sidebarWidth }}
        className="bg-white border-r border-slate-200 flex flex-col z-20 shadow-xl relative shrink-0"
      >
        <div 
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/40 z-30 transition-colors"
          onMouseDown={() => setIsResizingSidebar(true)}
        />
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-b from-slate-50 to-transparent overflow-hidden">
          <div className="flex items-center gap-3 truncate">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20 shrink-0">
              <Database size={18} className="text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900 truncate">AiSqlBoy</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                setNewConfig({
                  name: '',
                  type: 'mysql',
                  host: 'localhost',
                  port: 3306,
                  user: 'root',
                  password: '',
                  database: ''
                });
                setIsEditingConnection(false);
                setShowAddModal(true);
              }}
              className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full transition-colors border border-slate-200 text-slate-600"
              title="添加连接"
            >
              <Plus size={16} />
            </motion.button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Saved Connections */}
          <div className="p-4 space-y-4">
            <div className="px-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">我的连接</div>
              <div className="space-y-1">
                <AnimatePresence>
                  {savedConnections.map((conn) => (
                    <div key={conn.id} className="space-y-1">
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={() => handleConnect(conn)}
                        className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-300 relative overflow-hidden ${
                          activeConnection?.id === conn.id 
                          ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm' 
                          : 'hover:bg-slate-50 text-slate-600 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3 overflow-hidden z-10">
                          <div className={`w-2 h-2 rounded-full ${
                            conn.type === 'mysql' ? 'bg-orange-500' : 
                            conn.type === 'postgresql' ? 'bg-blue-500' : 
                            conn.type === 'redis' ? 'bg-red-500' : 
                            'bg-green-500'
                          }`} />
                          <span className="truncate font-semibold">{conn.name}</span>
                        </div>
                        <div className="flex items-center gap-1 z-10">
                          <motion.button 
                            whileHover={{ scale: 1.1, color: '#2563eb' }}
                            onClick={(e) => handleEditConnection(conn, e)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-blue-50 rounded-lg transition-all text-slate-400"
                            title="修改配置"
                          >
                            <Settings size={14} />
                          </motion.button>
                          <motion.button 
                            whileHover={{ scale: 1.1, color: '#ef4444' }}
                            onClick={(e) => handleDeleteConnection(conn.id!, e)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 rounded-lg transition-all text-slate-400"
                            title="删除连接"
                          >
                            <Trash2 size={14} />
                          </motion.button>
                          <ChevronRight size={14} className={`transition-transform duration-300 ${expandedConnections.has(conn.id!) ? 'rotate-90 opacity-100 text-blue-400' : 'opacity-0 group-hover:opacity-40'}`} />
                        </div>
                      </motion.div>

                      {/* Connection Expansion (Databases) */}
                      <AnimatePresence>
                        {expandedConnections.has(conn.id!) && activeConnection?.id === conn.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="ml-4 pl-2 border-l border-slate-100 space-y-4 py-2 overflow-hidden"
                          >
                            {/* Database List */}
                            <div className="px-2">
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                              <Layout size={16} /> 数据库
                            </div>
                              <div className="grid grid-cols-1 gap-1">
                                {databases.map((db) => (
                                  <div key={db} className="space-y-1">
                                    <motion.button
                                      whileHover={{ boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)' }}
                                      onClick={() => handleSelectDatabase(db)}
                                      onContextMenu={(e) => {
                                        e.preventDefault();
                                        setContextMenu({ x: e.clientX, y: e.clientY, type: 'database', target: db });
                                      }}
                                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left transition-all duration-200 ${
                                        selectedDatabase === db 
                                        ? 'bg-blue-50 text-blue-600 border border-blue-100' 
                                        : 'hover:bg-slate-50 text-slate-500 border border-transparent hover:text-slate-700'
                                      }`}
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        {activeConnection?.type === 'redis' ? (
                                          <Server size={16} className={`flex-shrink-0 ${selectedDatabase === db ? 'text-blue-500' : 'text-slate-400'}`} />
                                        ) : (
                                          <Database size={16} className={`flex-shrink-0 ${selectedDatabase === db ? 'text-blue-500' : 'text-slate-400'}`} />
                                        )}
                                        <span className="truncate font-semibold">{activeConnection?.type === 'redis' ? `DB ${db}` : db}</span>
                                      </div>
                                      <ChevronRight size={14} className={`transition-transform duration-300 ${expandedDatabases.has(db) ? 'rotate-90' : ''} ${selectedDatabase === db ? 'opacity-100' : 'opacity-0'}`} />
                                    </motion.button>

                                    {/* Database Expansion (Tables) */}
                                    <AnimatePresence>
                                      {expandedDatabases.has(db) && selectedDatabase === db && (
                                        <motion.div
                                          initial={{ height: 0, opacity: 0 }}
                                          animate={{ height: 'auto', opacity: 1 }}
                                          exit={{ height: 0, opacity: 0 }}
                                          transition={{ duration: 0.2, ease: "easeInOut" }}
                                          className="ml-4 pl-2 border-l border-slate-100 py-1 space-y-1 overflow-hidden"
                                        >
                                          {tables.map((table) => (
                                            <motion.button
                                              whileHover={{ boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)' }}
                                              key={table.name}
                                              onClick={() => handleSelectTable(table.name)}
                                              onContextMenu={(e) => {
                                                e.preventDefault();
                                                setContextMenu({ x: e.clientX, y: e.clientY, type: 'table', target: table.name });
                                              }}
                                              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-all duration-200 ${
                                                selectedTable === table.name 
                                                ? 'bg-blue-600 text-white shadow-md' 
                                                : 'hover:bg-slate-50 text-slate-500 hover:text-slate-700'
                                              }`}
                                            >
                                              {activeConnection?.type === 'redis' ? (
                                                <Key size={16} className={`flex-shrink-0 ${selectedTable === table.name ? 'text-blue-100' : 'text-slate-400'}`} />
                                              ) : (
                                                <Table size={16} className={`flex-shrink-0 ${selectedTable === table.name ? 'text-blue-100' : 'text-slate-400'}`} />
                                              )}
                                              <span className="truncate font-semibold">{table.name}</span>
                                            </motion.button>
                                          ))}
                                          {tables.length === 0 && (
                                            <div className="px-3 py-2 text-[10px] text-slate-400 italic">
                                              {activeConnection?.type === 'redis' ? '暂无 Key' : '暂无数据表'}
                                            </div>
                                          )}
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                ))}
                                {databases.length === 0 && (
                                  <div className="px-3 py-2 text-[10px] text-slate-400 italic">暂无数据库</div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </AnimatePresence>
                {savedConnections.length === 0 && (
                  <div className="text-xs text-slate-400 italic p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    点击上方 + 号添加连接
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <motion.div 
            whileHover={{ backgroundColor: '#f1f5f9' }}
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-3 px-4 py-3 text-slate-600 transition-all cursor-pointer rounded-2xl hover:shadow-sm group"
          >
            <Settings size={16} className="group-hover:rotate-45 transition-transform duration-500" />
            <span className="text-sm font-bold">系统设置</span>
          </motion.div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Background Gradients */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[120px] -z-10" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-indigo-100/30 rounded-full blur-[100px] -z-10" />

        {/* Header */}
        <header className="h-16 border-b border-slate-200 flex items-center px-8 justify-between bg-white/80 backdrop-blur-xl z-10 shadow-sm">
          <div className="flex items-center gap-4">
            <AnimatePresence mode="wait">
              {activeConnection ? (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="flex items-center gap-3 px-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-sm shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <Activity size={14} className={loading ? 'text-yellow-500 animate-spin' : 'text-green-500'} />
                    <span className="font-bold text-slate-900 tracking-tight">{activeConnection.name}</span>
                  </div>
                  <ChevronRight size={12} className="text-slate-300" />
                  <span className="text-slate-500 font-semibold">{selectedDatabase || '选择数据库'}</span>
                  {selectedTable && (
                    <>
                      <ChevronRight size={12} className="text-slate-300" />
                      <span className="text-blue-600 font-bold">{selectedTable}</span>
                    </>
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-slate-400 text-sm font-semibold"
                >
                  就绪
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Search Bar */}
          {(selectedTable || activeConsoleId) && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/50 transition-all shadow-sm">
              <Search size={14} className="text-slate-400" />
              <input 
                ref={searchInputRef}
                type="text"
                placeholder="搜索结果数据 (Ctrl+F)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleNextMatch();
                  }
                  if (e.key === 'Escape') {
                    e.currentTarget.blur();
                  }
                }}
                className="bg-transparent border-none outline-none text-sm w-48 text-slate-600 placeholder:text-slate-400 font-medium"
              />
              {searchTerm && (
                <div className="flex items-center gap-2 ml-2 border-l border-slate-200 pl-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase min-w-[40px] text-center">
                    {searchMatches.length > 0 ? `${currentMatchIdx + 1} / ${searchMatches.length}` : '无匹配'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={handlePrevMatch}
                      className="p-1 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                      title="上一个匹配"
                    >
                      <ChevronRight size={14} className="rotate-180" />
                    </button>
                    <button 
                      onClick={handleNextMatch}
                      className="p-1 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                      title="下一个匹配"
                    >
                      <ChevronRight size={14} />
                    </button>
                    <button 
                      onClick={() => setSearchTerm('')}
                      className="p-1 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-red-500"
                      title="清除搜索"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-hidden flex flex-col relative">
          {/* Tab Bar for Consoles */}
          {consoles.length > 0 && (
            <div className="flex bg-slate-50 border-b border-slate-200 px-4 pt-2 gap-1 overflow-x-auto custom-scrollbar items-end">
              {consoles.map((tab, idx) => (
                <div 
                  key={tab.id || `console-${idx}`}
                  title={tab.name}
                  onClick={() => {
                    setActiveConsoleId(tab.id);
                    setSelectedTable(null);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ 
                      x: e.clientX, 
                      y: e.clientY, 
                      type: 'console', 
                      target: tab.id 
                    });
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-t border-x ${
                    activeConsoleId === tab.id && !selectedTable
                    ? 'bg-white border-slate-200 text-blue-600 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]' 
                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Play size={12} className={tab.executing ? 'animate-spin' : ''} />
                  <span className="truncate max-w-[120px]">{tab.name}</span>
                  {tab.isDirty && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                  <X 
                    size={12} 
                    className="hover:text-red-500 transition-colors" 
                    onClick={(e) => handleCloseConsole(tab.id, e)}
                  />
                </div>
              ))}
              
              {/* Add Button */}
              <button
                onClick={handleOpenLoadConsoleModal}
                className="mb-1 p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-all flex-shrink-0"
                title="加载已保存的控制台"
              >
                <Plus size={16} />
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {selectedTable ? (
              <motion.div 
                key={selectedTable}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="flex-1 flex flex-col relative overflow-hidden"
              >
                <div 
                  className="flex-1 overflow-auto p-8 custom-scrollbar relative"
                  ref={tableContainerRef}
                  onScroll={(e) => handleContainerScroll(e, 'table')}
                >
                  <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-2xl shadow-slate-200/50 backdrop-blur-sm relative">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                          {columns.map((col) => (
                            <th
                              key={col.name}
                              className="px-6 py-5 text-left cursor-pointer hover:bg-slate-100/50 transition-colors group/th"
                              onClick={() => handleSort(col.name)}
                            >
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{col.type}</span>
                                  <div className={`transition-all duration-300 ${sortConfig.column === col.name ? 'opacity-100' : 'opacity-0 group-hover/th:opacity-30'}`}>
                                    {sortConfig.column === col.name && sortConfig.direction === 'ASC' && <ChevronRight size={12} className="-rotate-90 text-blue-500" />}
                                    {sortConfig.column === col.name && sortConfig.direction === 'DESC' && <ChevronRight size={12} className="rotate-90 text-blue-500" />}
                                    {sortConfig.column !== col.name && <RefreshCw size={10} className="text-slate-400" />}
                                  </div>
                                </div>
                                <span className="text-sm font-bold text-slate-800 tracking-tight">{col.name}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {data.map((row, i) => {
                          const isDeleted = deletedRows.has(i);
                          return (
                            <motion.tr 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: i * 0.02 }}
                              key={i} 
                              className={`group hover:bg-blue-50/40 transition-colors cursor-pointer ${isDeleted ? 'bg-red-50 opacity-60 grayscale-[0.5]' : ''}`}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenu({ 
                                  x: e.clientX, 
                                  y: e.clientY, 
                                  type: 'row', 
                                  target: i.toString() 
                                });
                              }}
                            >
                              {columns.map((col) => {
                                const isEditing = editingCellCoord?.rowIdx === i && editingCellCoord?.colName === col.name;
                                const isModified = editingCells[i]?.[col.name] !== undefined;
                                const isCurrentMatch = currentMatchIdx >= 0 && searchMatches[currentMatchIdx]?.rowIdx === i && searchMatches[currentMatchIdx]?.colName === col.name;
                                const displayValue = isModified ? editingCells[i][col.name] : row[col.name];
                                
                                const value = displayValue;
                                const isLongText = value && value.toString().length > 50;
                                const finalDisplayValue = isLongText 
                                  ? value.toString().substring(0, 50) + '...' 
                                  : (value === null ? 'NULL' : value.toString());

                                return (
                                  <td 
                                    key={col.name} 
                                    data-row-idx={i}
                                    data-col-name={col.name}
                                    className={`px-6 py-4 text-sm text-slate-600 border-x border-transparent transition-all ${isModified ? 'bg-yellow-50/50 !text-yellow-700' : ''} ${isEditing ? 'ring-2 ring-blue-500 ring-inset z-10 !bg-white' : ''} ${isCurrentMatch ? 'ring-2 ring-orange-400 ring-inset z-10 bg-orange-50' : ''}`}
                                    onDoubleClick={() => handleCellDoubleClick(i, col.name, row[col.name])}
                                  >
                                    {isEditing ? (
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
                                    ) : (
                                      <>
                                        {value === null ? (
                                          <span className="text-slate-300 italic font-mono text-xs tracking-tighter">NULL</span>
                                        ) : (
                                          <div className="flex items-center gap-3">
                                            <span className={`truncate max-w-[400px] group-hover:text-slate-900 transition-colors font-mono text-[13px] ${isModified ? 'font-bold' : ''}`}>
                                              {searchTerm ? (
                                                (() => {
                                                  const text = finalDisplayValue;
                                                  const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
                                                  return parts.map((part, index) => 
                                                    part.toLowerCase() === searchTerm.toLowerCase() ? (
                                                      <mark key={index} className="bg-yellow-200 text-slate-900 rounded-sm px-0.5">{part}</mark>
                                                    ) : part
                                                  );
                                                })()
                                              ) : finalDisplayValue}
                                            </span>
                                            {isLongText && (
                                              <motion.button
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setTextDetail({ content: value, fieldName: col.name });
                                                  setIsJsonFormatted(false);
                                                }}
                                                className="text-blue-500 hover:text-blue-600 p-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100"
                                              >
                                                <Plus size={10} />
                                              </motion.button>
                                            )}
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </td>
                                );
                              })}
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Pagination Controls */}
                  {data.length > 0 && (
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          共 {totalRows} 条数据
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
                  )}

                  {data.length === 0 && (
                    <div className="p-24 text-center">
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

              {/* 数据编辑浮动操作条 - 移至此处以确保在滚动时保持固定 */}
                <AnimatePresence>
                  {(Object.keys(editingCells).length > 0 || deletedRows.size > 0) && (
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
              </motion.div>
            ) : activeConsoleId && consoles.find(c => c.id === activeConsoleId) ? (
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
                      onMouseUp={(e) => handleSelection(e)}
                      onKeyUp={(e) => handleSelection(e)}
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
                                <Table size={10} /> 表名建议
                              </span>
                              <span className="text-[10px] text-slate-400">↑↓ 选择, Enter 确认</span>
                            </div>
                            <div 
                              ref={suggestionListRef}
                              className="max-h-60 overflow-y-auto py-1 custom-scrollbar scroll-smooth"
                            >
                              {suggestionInfo.list.map((name, i) => (
                                <button
                                  key={name}
                                  onClick={() => insertSuggestion(name)}
                                  onMouseEnter={() => setSuggestionInfo(prev => ({ ...prev, index: i }))}
                                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between group transition-colors ${
                                    suggestionInfo.index === i ? 'bg-blue-600 text-white' : 'hover:bg-blue-50 text-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <Table size={14} className={suggestionInfo.index === i ? 'text-blue-200' : 'text-slate-400'} />
                                    <span className="font-mono">{name}</span>
                                  </div>
                                  {suggestionInfo.index === i && (
                                    <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded border border-blue-400">TAB</span>
                                  )}
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
                            const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5);
                            const endIdx = Math.min(results.length, Math.floor((scrollTop + viewportHeight) / ROW_HEIGHT) + 5);
                            const visibleResults = results.slice(startIdx, endIdx);
                            const paddingTop = startIdx * ROW_HEIGHT;
                            const paddingBottom = Math.max(0, (results.length - endIdx) * ROW_HEIGHT);

                            return (
                              <div style={{ height: results.length * ROW_HEIGHT || 'auto', minHeight: '100%' }}>
                                <table className="w-full border-collapse table-fixed">
                                  <thead>
                                    <tr className="bg-slate-50 sticky top-0 z-10 h-[48px]">
                                      {activeConsole.columns?.map(col => (
                                        <th key={col} className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 overflow-hidden truncate">{col}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {paddingTop > 0 && <tr><td colSpan={activeConsole.columns?.length} style={{ height: paddingTop }}></td></tr>}
                                    {visibleResults.map((row, i) => {
                                      const actualRowIdx = startIdx + i;
                                      return (
                                        <tr key={actualRowIdx} className="hover:bg-blue-50/30 transition-colors h-[48px]">
                                          {activeConsole.columns?.map(col => (
                                            <td 
                                              key={col} 
                                              className="px-4 py-3 text-sm text-slate-600 font-mono overflow-hidden truncate"
                                              data-row-idx={actualRowIdx}
                                              data-col-name={col}
                                            >
                                              {row[col] === null ? (
                                                <span className="text-slate-300 italic font-mono text-xs tracking-tighter">NULL</span>
                                              ) : (
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                  <span className="truncate max-w-[400px] font-mono text-[13px]">
                                                    {searchTerm ? (
                                                      (() => {
                                                        const text = String(row[col]);
                                                        const displayText = text.length > 50 ? text.substring(0, 50) + '...' : text;
                                                        const parts = displayText.split(new RegExp(`(${searchTerm})`, 'gi'));
                                                        return parts.map((part, index) => 
                                                          part.toLowerCase() === searchTerm.toLowerCase() ? (
                                                            <mark key={index} className="bg-yellow-200 text-slate-900 rounded-sm px-0.5">{part}</mark>
                                                          ) : part
                                                        );
                                                      })()
                                                    ) : (
                                                      String(row[col]).length > 50 ? String(row[col]).substring(0, 50) + '...' : String(row[col])
                                                    )}
                                                  </span>
                                                  {String(row[col]).length > 50 && (
                                                    <motion.button
                                                      whileHover={{ scale: 1.1 }}
                                                      whileTap={{ scale: 0.9 }}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setTextDetail({ content: row[col], fieldName: col });
                                                        setIsJsonFormatted(false);
                                                      }}
                                                      className="flex-shrink-0 text-blue-500 hover:text-blue-600 p-1 bg-blue-50 hover:bg-blue-100 rounded transition-colors border border-blue-100"
                                                    >
                                                      <Plus size={8} />
                                                    </motion.button>
                                                  )}
                                                </div>
                                              )}
                                            </td>
                                          ))}
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
      </div>

      {/* Modals with AnimatePresence */}
      <AnimatePresence>
        {showConsoleRenameModal && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConsoleRenameModal(false)}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-[400px] overflow-hidden z-10"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-slate-50 to-transparent">
                <div>
                  <h3 className="font-bold text-xl text-slate-900 tracking-tight">保存/重命名控制台</h3>
                </div>
                <motion.button 
                  whileHover={{ rotate: 90, scale: 1.1 }}
                  onClick={() => setShowConsoleRenameModal(false)} 
                  className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                >
                  <X size={20} />
                </motion.button>
              </div>
              <div className="p-8 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">控制台名称</label>
                  <input
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                    value={consoleRenameData.name}
                    onChange={(e) => setConsoleRenameData({ ...consoleRenameData, name: e.target.value })}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveConsole(consoleRenameData.id, consoleRenameData.name);
                        setShowConsoleRenameModal(false);
                      }
                    }}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowConsoleRenameModal(false)}
                    className="flex-1 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all"
                  >
                    取消
                  </button>
                  <button 
                    onClick={() => {
                      handleSaveConsole(consoleRenameData.id, consoleRenameData.name);
                      setShowConsoleRenameModal(false);
                    }}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-blue-200 transition-all"
                  >
                    确认保存
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-[480px] overflow-hidden z-10"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-slate-50 to-transparent">
                <div>
                  <h3 className="font-bold text-xl text-slate-900 tracking-tight">新建连接</h3>
                  <p className="text-xs text-slate-500 mt-1 font-semibold">配置您的数据库连接信息</p>
                </div>
                <motion.button 
                  whileHover={{ rotate: 90, scale: 1.1 }}
                  onClick={() => setShowAddModal(false)} 
                  className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                >
                  <X size={20} />
                </motion.button>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-4 gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                  <button
                    onClick={() => setNewConfig({ ...newConfig, type: 'mysql', port: 3306 })}
                    className={`py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                      newConfig.type === 'mysql' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    MySQL
                  </button>
                  <button
                    onClick={() => setNewConfig({ ...newConfig, type: 'postgresql', port: 5432 })}
                    className={`py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                      newConfig.type === 'postgresql' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    PostgreSQL
                  </button>
                  <button
                    onClick={() => setNewConfig({ ...newConfig, type: 'sqlite' })}
                    className={`py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                      newConfig.type === 'sqlite' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    SQLite
                  </button>
                  <button
                    onClick={() => setNewConfig({ ...newConfig, type: 'redis', port: 6379 })}
                    className={`py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                      newConfig.type === 'redis' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Redis
                  </button>
                </div>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">连接名称</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all placeholder:text-slate-300"
                      placeholder="例如: 生产环境主库"
                      value={newConfig.name}
                      onChange={(e) => setNewConfig({ ...newConfig, name: e.target.value })}
                    />
                  </div>

                  {newConfig.type !== 'sqlite' ? (
                    <>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2 space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">主机地址</label>
                          <input
                            type="text"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                            value={newConfig.host}
                            onChange={(e) => setNewConfig({ ...newConfig, host: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">端口</label>
                          <input
                            type="number"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                            value={newConfig.port}
                            onChange={(e) => setNewConfig({ ...newConfig, port: parseInt(e.target.value) })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">用户名</label>
                          <input
                            type="text"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                            value={newConfig.user}
                            onChange={(e) => setNewConfig({ ...newConfig, user: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">密码</label>
                          <input
                            type="password"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                            value={newConfig.password}
                            onChange={(e) => setNewConfig({ ...newConfig, password: e.target.value })}
                          />
                        </div>
                      </div>
                      {newConfig.type !== 'redis' && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">数据库 (可选)</label>
                          <input
                            type="text"
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                            placeholder="例如: user_db"
                            value={newConfig.database}
                            onChange={(e) => setNewConfig({ ...newConfig, database: e.target.value })}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">SQLite 文件路径</label>
                      <input
                        type="text"
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                        placeholder="C:/path/to/database.db"
                        value={newConfig.database}
                        onChange={(e) => setNewConfig({ ...newConfig, database: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 transition-all"
                >
                  取消
                </button>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveConnection}
                  className="flex-[2] py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-blue-600/20 transition-all"
                >
                  保存连接
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Text Detail Modal */}
      <AnimatePresence>
        {textDetail && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-10">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setTextDetail(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xl"
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
                    <h3 className="font-bold text-2xl text-slate-900 tracking-tight">{textDetail.fieldName}</h3>
                    <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-widest">详细内容预览</p>
                  </div>
                </div>
                <motion.button 
                  whileHover={{ rotate: 90, scale: 1.1 }}
                  onClick={() => setTextDetail(null)} 
                  className="w-12 h-12 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                >
                  <X size={24} />
                </motion.button>
              </div>
              <div className="p-10 overflow-y-auto custom-scrollbar flex-1">
                <div className="bg-slate-50 rounded-3xl p-8 border border-slate-200 shadow-inner">
                  <pre className="whitespace-pre-wrap break-all text-[15px] leading-relaxed text-slate-700 font-mono selection:bg-blue-100">
                    {isJsonFormatted ? formatJson(textDetail.content) : (typeof textDetail.content === 'object' ? JSON.stringify(textDetail.content) : textDetail.content)}
                  </pre>
                </div>
              </div>
              <div className="px-10 py-8 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                <div>
                  {isJsonLike(textDetail.content) && (
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
                  onClick={() => setTextDetail(null)}
                  className="px-10 py-3.5 bg-white hover:bg-slate-100 text-slate-700 rounded-2xl text-sm font-bold border border-slate-200 transition-all shadow-sm"
                >
                  关闭预览
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            options={
              contextMenu.type === 'row' ? [
                {
                  label: deletedRows.has(parseInt(contextMenu.target)) ? '取消删除' : '删除行',
                  icon: <Trash2 size={14} />,
                  onClick: () => handleLocalRowDelete(parseInt(contextMenu.target)),
                  danger: !deletedRows.has(parseInt(contextMenu.target))
                }
              ] : contextMenu.type === 'console' ? [
                { 
                  label: '重命名', 
                  icon: <Activity size={14} />, 
                  onClick: () => {
                    const tab = consoles.find(c => c.id === contextMenu.target);
                    if (tab) {
                      setConsoleRenameData({ id: tab.id, name: tab.name });
                      setShowConsoleRenameModal(true);
                    }
                  }
                },
                { 
                  label: '从本地删除', 
                  icon: <Trash2 size={14} />, 
                  onClick: () => handleDeleteConsole(contextMenu.target),
                  danger: true 
                },
                { 
                  label: '关闭', 
                  icon: <X size={14} />, 
                  onClick: () => handleCloseConsole(contextMenu.target) 
                }
              ] : contextMenu.type === 'database' ? [
                { 
                  label: activeConnection?.type === 'redis' ? '新建命令控制台' : '新建查询控制台', 
                  icon: <Play size={14} />, 
                  onClick: () => handleNewConsole(contextMenu.target) 
                },
                { 
                  label: 'AI 助手', 
                  icon: <Sparkles size={14} className="text-indigo-500" />, 
                  onClick: () => handleOpenAIModal('database', contextMenu.target) 
                },
                ...(activeConnection?.type !== 'redis' ? [
                  { 
                    label: '添加表', 
                    icon: <Plus size={14} />, 
                    onClick: () => {
                      setSchemaData({ tableName: 'new_table', columns: [], indexes: [] });
                      setShowSchemaModal(true);
                    } 
                  }
                ] : []),
                { 
                  label: '刷新', 
                  icon: <RefreshCw size={14} />, 
                  onClick: () => loadDatabases() 
                },
                ...(activeConnection?.type !== 'redis' ? [
                  { 
                    label: '导出 SQL (仅结构)', 
                    icon: <Server size={14} />, 
                    onClick: () => handleExportDB(false) 
                  },
                  { 
                    label: '导出 SQL (结构 + 数据)', 
                    icon: <Server size={14} />, 
                    onClick: () => handleExportDB(true) 
                  }
                ] : []),
                { 
                  label: activeConnection?.type === 'redis' ? '清空数据库 (Flush)' : '删除数据库', 
                  icon: <Trash2 size={14} />, 
                  onClick: () => handleDeleteDB(contextMenu.target),
                  danger: true 
                },
              ] : [
                { 
                  label: activeConnection?.type === 'redis' ? '查看 Key 内容' : '打开表', 
                  icon: <Play size={14} />, 
                  onClick: () => handleSelectTable(contextMenu.target) 
                },
                { 
                  label: '新建查询控制台', 
                  icon: <Play size={14} />, 
                  onClick: () => handleNewConsole(selectedDatabase!, contextMenu.target) 
                },
                { 
                  label: 'AI 助手', 
                  icon: <Sparkles size={14} className="text-indigo-500" />, 
                  onClick: () => handleOpenAIModal('table', contextMenu.target) 
                },
                { 
                  label: '刷新列表', 
                  icon: <RefreshCw size={14} />, 
                  onClick: async () => {
                    const tableList = await window.electronAPI.getTables();
                    setTables(tableList);
                  } 
                },
                ...(activeConnection?.type === 'redis' ? [
                  ...(contextMenu.target !== 'Keys' ? [
                    {
                      label: '删除 Key',
                      icon: <Trash2 size={14} />,
                      onClick: () => handleDeleteTable(contextMenu.target),
                      danger: true
                    }
                  ] : [])
                ] : [
                  { 
                    label: '修改表结构', 
                    icon: <Activity size={14} />, 
                    onClick: () => handleOpenSchemaModal(contextMenu.target)
                  },
                  { 
                    label: '重命名', 
                    icon: <RefreshCw size={14} />, 
                    onClick: () => {
                      setRenameData({ oldName: contextMenu.target, newName: contextMenu.target });
                      setShowRenameModal(true);
                    } 
                  },
                  { 
                    label: '删除表', 
                    icon: <Trash2 size={14} />, 
                    onClick: () => handleDeleteTable(contextMenu.target),
                    danger: true 
                  }
                ])
              ]
            }
          />
        )}
      </AnimatePresence>

      {/* AI Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-[400px] overflow-hidden z-10"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-slate-50 to-transparent">
                <div className="flex items-center gap-2">
                  <Bot size={20} className="text-indigo-600" />
                  <h3 className="font-bold text-lg text-slate-900 tracking-tight">系统设置</h3>
                </div>
                <motion.button 
                  whileHover={{ rotate: 90, scale: 1.1 }}
                  onClick={() => setShowSettings(false)} 
                  className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                >
                  <X size={16} />
                </motion.button>
              </div>
              
              <div className="p-8 space-y-8 max-h-[400px] overflow-y-auto custom-scrollbar">
                {/* AI Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={14} className="text-indigo-500" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">AI 功能配置</span>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">DeepSeek API Key</label>
                    <input
                      type="password"
                      autoFocus
                      placeholder="sk-..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <p className="text-xs text-slate-400 px-1">请从 DeepSeek 官网获取 API Key 以启用 AI 功能</p>
                  </div>
                </div>

                {/* Update Section */}
                <div className="pt-6 border-t border-slate-100 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw size={14} className="text-indigo-500" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">软件更新</span>
                  </div>
                  
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">当前版本</span>
                          <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full font-medium">v{appVersion}</span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {updateStatus.message || '检查新版本以获取最新功能和修复'}
                        </p>
                      </div>
                      
                      {updateStatus.type === 'idle' || updateStatus.type === 'not-available' || updateStatus.type === 'error' ? (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={handleCheckUpdates}
                          disabled={updateStatus.type === 'checking'}
                          className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                          {updateStatus.type === 'checking' ? (
                            <Loader2 size={14} className="animate-spin text-indigo-600" />
                          ) : (
                            <RefreshCw size={14} className="text-indigo-600" />
                          )}
                          检查更新
                        </motion.button>
                      ) : null}
                    </div>

                    {/* Progress or Actions */}
                    {updateStatus.type === 'available' && (
                      <div className="mt-4 pt-4 border-t border-slate-200/50 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-xs font-bold text-indigo-600">发现新版本 v{updateStatus.info?.version}</p>
                            {updateStatus.info?.releaseNotes && (
                              <div className="mt-2 text-[10px] text-slate-500 line-clamp-2 overflow-hidden whitespace-pre-wrap">
                                {typeof updateStatus.info.releaseNotes === 'string' 
                                  ? updateStatus.info.releaseNotes.replace(/<[^>]*>?/gm, '') 
                                  : Array.isArray(updateStatus.info.releaseNotes) 
                                    ? updateStatus.info.releaseNotes.map((n: any) => typeof n === 'string' ? n : n.note).join(', ').replace(/<[^>]*>?/gm, '')
                                    : ''}
                              </div>
                            )}
                          </div>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleDownloadUpdate}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 flex items-center gap-2 shrink-0"
                          >
                            <Download size={14} />
                            立即下载
                          </motion.button>
                        </div>
                      </div>
                    )}

                    {updateStatus.type === 'downloading' && (
                      <div className="mt-4 pt-4 border-t border-slate-200/50 space-y-2">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                          <span className="text-indigo-600">正在下载...</span>
                          <span className="text-slate-400">{Math.round(updateStatus.progress || 0)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-indigo-600"
                            initial={{ width: 0 }}
                            animate={{ width: `${updateStatus.progress || 0}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {updateStatus.type === 'downloaded' && (
                      <div className="mt-4 pt-4 border-t border-slate-200/50 flex items-center justify-between gap-4">
                        <div className="flex-1 flex items-center gap-2">
                          <CheckCircle2 size={16} className="text-emerald-500" />
                          <p className="text-xs font-bold text-emerald-600">更新已就绪</p>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={handleInstallUpdate}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                        >
                          <Play size={14} />
                          重启并安装
                        </motion.button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                <button 
                  onClick={() => setShowSettings(false)}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 transition-all"
                >
                  取消
                </button>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveSettings}
                  className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-600/20 transition-all"
                >
                  保存配置
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Update Modal */}
      <AnimatePresence>
        {showUpdateModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUpdateModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-[400px] overflow-hidden z-10"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-indigo-50 to-transparent">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                    <ArrowUp size={18} className="text-indigo-600" />
                  </div>
                  <h3 className="font-bold text-lg text-slate-900 tracking-tight">发现新版本</h3>
                </div>
                <motion.button 
                  whileHover={{ rotate: 90, scale: 1.1 }}
                  onClick={() => setShowUpdateModal(false)} 
                  className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                >
                  <X size={16} />
                </motion.button>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="flex flex-col items-center text-center space-y-2">
                  <div className="text-4xl font-black text-slate-900 tracking-tighter italic">
                    v{updateStatus.info?.version}
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    发现了一个新版本，包含了多项改进和错误修复。建议立即更新以获得最佳体验。
                  </p>
                </div>

                {updateStatus.info?.releaseNotes && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-indigo-500" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">更新内容</span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 max-h-[150px] overflow-y-auto custom-scrollbar">
                      {typeof updateStatus.info.releaseNotes === 'string' ? (
                        <div 
                          className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{ __html: updateStatus.info.releaseNotes }}
                        />
                      ) : Array.isArray(updateStatus.info.releaseNotes) ? (
                        <ul className="space-y-2">
                          {updateStatus.info.releaseNotes.map((note: any, i: number) => (
                            <li key={i} className="text-xs text-slate-600 leading-relaxed flex gap-2">
                              <span className="text-indigo-400 font-bold">•</span>
                              <div dangerouslySetInnerHTML={{ __html: typeof note === 'string' ? note : note.note }} />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                )}

                {updateStatus.type === 'downloading' ? (
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                      <span className="text-indigo-600">正在下载...</span>
                      <span className="text-slate-400">{Math.round(updateStatus.progress || 0)}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50 p-0.5">
                      <motion.div 
                        className="h-full bg-indigo-600 rounded-full shadow-sm shadow-indigo-600/20"
                        initial={{ width: 0 }}
                        animate={{ width: `${updateStatus.progress || 0}%` }}
                      />
                    </div>
                  </div>
                ) : updateStatus.type === 'downloaded' ? (
                  <div className="flex items-center justify-center gap-2 py-2 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <span className="text-xs font-bold text-emerald-600">下载完成，准备安装</span>
                  </div>
                ) : null}
              </div>

              <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                <button 
                  onClick={() => setShowUpdateModal(false)}
                  disabled={updateStatus.type === 'downloading'}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 transition-all disabled:opacity-50"
                >
                  稍后再说
                </button>
                {updateStatus.type === 'downloaded' ? (
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleInstallUpdate}
                    className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Play size={16} />
                    立即重启安装
                  </motion.button>
                ) : (
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleDownloadUpdate}
                    disabled={updateStatus.type === 'downloading'}
                    className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Download size={16} />
                    {updateStatus.type === 'downloading' ? '正在下载...' : '立即下载更新'}
                  </motion.button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Chat Modal */}
      <AnimatePresence>
        {showAIModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAIModal(false)}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-[600px] h-[500px] overflow-hidden z-10 flex flex-col"
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
                  onClick={() => setShowAIModal(false)} 
                  className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                >
                  <X size={16} />
                </motion.button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
                {aiMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                    <Bot size={40} className="text-slate-300" />
                    <p className="text-sm">告诉我你想查什么，或者需要生成什么 SQL</p>
                  </div>
                )}
                {aiMessages.map((msg, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      msg.role === 'user' ? 'bg-slate-200' : 'bg-indigo-100 text-indigo-600'
                    }`}>
                      {msg.role === 'user' ? <AlignLeft size={16} /> : <Bot size={16} />}
                    </div>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-white border border-slate-200 shadow-sm text-slate-700' 
                        : 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <div className="space-y-2">
                          <div className="whitespace-pre-wrap">{msg.content.split('```')[0]}</div>
                          {(msg.content.match(/```sql\n([\s\S]*?)\n```/) || msg.content.match(/```([\s\S]*?)\n```/)) && (
                            <div className="mt-2">
                              <div className="bg-black/20 rounded-lg p-3 font-mono text-xs overflow-x-auto">
                                {(msg.content.match(/```sql\n([\s\S]*?)\n```/) || msg.content.match(/```([\s\S]*?)\n```/))![1]}
                              </div>
                              <button 
                                onClick={() => handleApplyAISQL(msg.content)}
                                className="mt-2 w-full py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2"
                              >
                                <Play size={12} /> 应用到控制台
                              </button>
                            </div>
                          )}
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
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAIChat()}
                />
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleAIChat}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 transition-all"
                >
                  <Send size={18} />
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Table Modal */}
      <AnimatePresence>
        {showRenameModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRenameModal(false)}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-[400px] overflow-hidden z-10"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-slate-50 to-transparent">
                <h3 className="font-bold text-lg text-slate-900 tracking-tight">重命名数据表</h3>
                <motion.button 
                  whileHover={{ rotate: 90, scale: 1.1 }}
                  onClick={() => setShowRenameModal(false)} 
                  className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                >
                  <X size={16} />
                </motion.button>
              </div>
              
              <div className="p-8 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">旧名称</label>
                  <input
                    type="text"
                    disabled
                    className="w-full bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 text-slate-400 outline-none transition-all"
                    value={renameData.oldName}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">新名称</label>
                  <input
                    type="text"
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                    value={renameData.newName}
                    onChange={(e) => setRenameData({ ...renameData, newName: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && handleRenameTable()}
                  />
                </div>
              </div>

              <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                <button 
                  onClick={() => setShowRenameModal(false)}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 transition-all"
                >
                  取消
                </button>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleRenameTable}
                  className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-blue-600/20 transition-all"
                >
                  确认重命名
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Schema Editor Modal */}
      <AnimatePresence>
        {showSchemaModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSchemaModal(false)}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-[900px] max-h-[85vh] flex flex-col overflow-hidden z-10"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-slate-50 to-transparent">
                <div>
                  <h3 className="font-bold text-lg text-slate-900 tracking-tight">
                    {tables.some(t => t.name === schemaData.tableName) ? '修改表结构' : '创建新表'}
                  </h3>
                  <div className="text-xs text-slate-500 mt-1 font-semibold flex items-center gap-2">
                    <Table size={12} />
                    {tables.some(t => t.name === schemaData.tableName) ? (
                      <span>{schemaData.tableName}</span>
                    ) : (
                      <input
                        type="text"
                        placeholder="输入表名..."
                        value={schemaData.tableName === 'new_table' ? '' : schemaData.tableName}
                        onChange={(e) => setSchemaData({ ...schemaData, tableName: e.target.value })}
                        className="bg-white border border-slate-200 rounded px-2 py-0.5 outline-none focus:border-blue-500 font-mono"
                      />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      if (activeSchemaTab === 'columns') {
                        const newCol = { id: Date.now(), name: 'new_column', type: 'VARCHAR(255)', nullable: true, primaryKey: false, autoIncrement: false, originalName: null };
                        setSchemaData({ ...schemaData, columns: [...schemaData.columns, newCol] });
                      } else {
                        const newIdx = { id: Date.now(), name: `idx_${schemaData.tableName}_${Date.now().toString().slice(-4)}`, columns: [], unique: false, originalName: null };
                        setSchemaData({ ...schemaData, indexes: [...schemaData.indexes, newIdx] });
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors"
                  >
                    <Plus size={14} /> {activeSchemaTab === 'columns' ? '添加列' : '添加索引'}
                  </motion.button>
                  <motion.button 
                    whileHover={{ rotate: 90, scale: 1.1 }}
                    onClick={() => setShowSchemaModal(false)} 
                    className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                  >
                    <X size={16} />
                  </motion.button>
                </div>
              </div>
              
              <div className="px-8 py-2 border-b border-slate-100 flex gap-6 bg-slate-50/30">
                <button
                  onClick={() => setActiveSchemaTab('columns')}
                  className={`py-2 text-xs font-bold transition-all relative ${
                    activeSchemaTab === 'columns' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  字段设计
                  {activeSchemaTab === 'columns' && (
                    <motion.div layoutId="schemaTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                  )}
                </button>
                <button
                  onClick={() => setActiveSchemaTab('indexes')}
                  className={`py-2 text-xs font-bold transition-all relative ${
                    activeSchemaTab === 'indexes' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  索引设计
                  {activeSchemaTab === 'indexes' && (
                    <motion.div layoutId="schemaTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                  )}
                </button>
              </div>

              <div className="flex-1 overflow-auto p-0">
                {activeSchemaTab === 'columns' ? (
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                      <tr>
                        <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">列名</th>
                        <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">类型</th>
                        <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-20">允许空</th>
                        <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-20">主键</th>
                        <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-20">自增</th>
                        <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">默认值</th>
                        <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-16">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {schemaData.columns.map((col, idx) => (
                        <motion.tr 
                          key={col.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="group hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-6 py-3">
                            <input 
                              type="text" 
                              value={col.name}
                              onChange={(e) => {
                                const newCols = [...schemaData.columns];
                                newCols[idx].name = e.target.value;
                                setSchemaData({ ...schemaData, columns: newCols });
                              }}
                              className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm font-mono text-slate-700 font-semibold"
                            />
                          </td>
                          <td className="px-6 py-3 relative group/type">
                              <div className="flex items-center">
                                <input 
                                  type="text" 
                                  value={col.type}
                                  onChange={(e) => {
                                    const newCols = [...schemaData.columns];
                                    newCols[idx].type = e.target.value;
                                    setSchemaData({ ...schemaData, columns: newCols });
                                  }}
                                  className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm text-blue-600 font-mono pr-6 relative z-10"
                                  placeholder="选择或输入类型..."
                                />
                                <div className="absolute right-4 pointer-events-none text-slate-300 group-hover/type:text-blue-400 transition-colors z-20">
                                  <ChevronRight size={12} className="rotate-90" />
                                </div>
                                <select 
                                  value=""
                                  onChange={(e) => {
                                    const newCols = [...schemaData.columns];
                                    newCols[idx].type = e.target.value;
                                    setSchemaData({ ...schemaData, columns: newCols });
                                  }}
                                  className="absolute inset-0 opacity-0 cursor-pointer w-full z-0"
                                >
                                  <option value="" disabled>选择常用类型...</option>
                                  {(
                                    activeConnection?.type === 'sqlite' ? DB_TYPES.sqlite : 
                                    activeConnection?.type === 'postgresql' ? DB_TYPES.postgresql : 
                                    DB_TYPES.mysql
                                  ).map(type => (
                                    <option key={type} value={type}>{type}</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                          <td className="px-6 py-3 text-center">
                            <input 
                              type="checkbox" 
                              checked={col.nullable}
                              onChange={(e) => {
                                const newCols = [...schemaData.columns];
                                newCols[idx].nullable = e.target.checked;
                                setSchemaData({ ...schemaData, columns: newCols });
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-6 py-3 text-center">
                            <input 
                              type="checkbox" 
                              checked={col.primaryKey}
                              onChange={(e) => {
                                const newCols = [...schemaData.columns];
                                newCols[idx].primaryKey = e.target.checked;
                                setSchemaData({ ...schemaData, columns: newCols });
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-6 py-3 text-center">
                            <input 
                              type="checkbox" 
                              checked={col.autoIncrement}
                              onChange={(e) => {
                                const newCols = [...schemaData.columns];
                                newCols[idx].autoIncrement = e.target.checked;
                                setSchemaData({ ...schemaData, columns: newCols });
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-6 py-3">
                            <input 
                              type="text" 
                              value={col.defaultValue || ''}
                              placeholder="NULL"
                              onChange={(e) => {
                                const newCols = [...schemaData.columns];
                                newCols[idx].defaultValue = e.target.value;
                                setSchemaData({ ...schemaData, columns: newCols });
                              }}
                              className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-xs text-slate-500"
                            />
                          </td>
                          <td className="px-6 py-3 text-center">
                            <button 
                              onClick={() => {
                                const newCols = schemaData.columns.filter(c => c.id !== col.id);
                                setSchemaData({ ...schemaData, columns: newCols });
                              }}
                              className="text-slate-300 hover:text-red-500 transition-colors p-1"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-0">
                    <table className="w-full border-collapse">
                      <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                        <tr>
                          <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">索引名称</th>
                          <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">包含字段</th>
                          <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-24">唯一</th>
                          <th className="px-6 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest w-16">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {schemaData.indexes.map((idx, i) => (
                          <motion.tr 
                            key={idx.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="group hover:bg-slate-50/50 transition-colors"
                          >
                            <td className="px-6 py-3">
                              <input 
                                type="text" 
                                value={idx.name}
                                onChange={(e) => {
                                  const newIdxs = [...schemaData.indexes];
                                  newIdxs[i].name = e.target.value;
                                  setSchemaData({ ...schemaData, indexes: newIdxs });
                                }}
                                className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm font-mono text-slate-700 font-semibold"
                              />
                            </td>
                            <td className="px-6 py-3">
                              <div className="flex flex-wrap gap-1">
                                {idx.columns.map((colName: string, colIdx: number) => (
                                  <div key={colIdx} className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded flex items-center gap-1 text-xs font-semibold">
                                    {colName}
                                    <X 
                                      size={10} 
                                      className="cursor-pointer hover:text-red-500" 
                                      onClick={() => {
                                        const newIdxs = [...schemaData.indexes];
                                        newIdxs[i].columns = newIdxs[i].columns.filter((_: any, ci: number) => ci !== colIdx);
                                        setSchemaData({ ...schemaData, indexes: newIdxs });
                                      }}
                                    />
                                  </div>
                                ))}
                                <select
                                  value=""
                                  onChange={(e) => {
                                    if (!e.target.value) return;
                                    const newIdxs = [...schemaData.indexes];
                                    if (!newIdxs[i].columns.includes(e.target.value)) {
                                      newIdxs[i].columns.push(e.target.value);
                                      setSchemaData({ ...schemaData, indexes: newIdxs });
                                    }
                                  }}
                                  className="text-xs bg-slate-100 border-none rounded px-1 outline-none text-slate-500 cursor-pointer"
                                >
                                  <option value="">+ 添加字段</option>
                                  {schemaData.columns.map(c => (
                                    <option key={c.name} value={c.name}>{c.name}</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td className="px-6 py-3 text-center">
                              <input 
                                type="checkbox" 
                                checked={idx.unique}
                                onChange={(e) => {
                                  const newIdxs = [...schemaData.indexes];
                                  newIdxs[i].unique = e.target.checked;
                                  setSchemaData({ ...schemaData, indexes: newIdxs });
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-6 py-3 text-center">
                              <button 
                                onClick={() => {
                                  const newIdxs = schemaData.indexes.filter((_, idxIdx) => idxIdx !== i);
                                  setSchemaData({ ...schemaData, indexes: newIdxs });
                                }}
                                className="text-slate-300 hover:text-red-500 transition-colors p-1"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                    {schemaData.indexes.length === 0 && (
                      <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
                        <Activity size={32} className="opacity-20" />
                        <p className="text-sm">暂无索引，点击右上角添加</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
                <button 
                  onClick={() => setShowSchemaModal(false)}
                  className="px-6 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 transition-all"
                >
                  取消
                </button>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleUpdateSchema}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
                >
                  <Server size={14} /> 保存修改
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Load Console Modal */}
      <AnimatePresence>
        {showLoadConsoleModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
                    <Terminal size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">恢复控制台</h3>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">选择要重新加载的查询控制台</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowLoadConsoleModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 max-h-[400px] overflow-y-auto custom-scrollbar bg-slate-50/50">
                <div className="grid grid-cols-1 gap-3">
                  {savedConsoles.length > 0 ? (
                     savedConsoles.map((tab, idx) => {
                       const isOpen = consoles.some(c => c.id === tab.id);
                       return (
                         <motion.div
                           key={tab.id || `saved-${idx}`}
                          whileHover={{ scale: 1.01, x: 5 }}
                          onClick={() => handleRestoreConsole(tab)}
                          className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                            isOpen 
                            ? 'bg-blue-50/50 border-blue-100' 
                            : 'bg-white border-slate-200 hover:border-blue-400 hover:shadow-md'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-xl ${isOpen ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                              <Play size={16} />
                            </div>
                            <div>
                              <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                {tab.name}
                                {isOpen && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full uppercase">已打开</span>}
                              </div>
                              <div className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-2">
                                <Activity size={12} />
                                {tab.dbName} {tab.tableName ? `· ${tab.tableName}` : ''}
                              </div>
                            </div>
                          </div>
                          <ChevronRight size={16} className={isOpen ? 'text-blue-400' : 'text-slate-300'} />
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-3">
                      <Terminal size={48} className="opacity-10" />
                      <p className="font-bold text-sm">暂无已保存的控制台</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-8 py-6 border-t border-slate-100 bg-white flex justify-end">
                <button 
                  onClick={() => setShowLoadConsoleModal(false)}
                  className="px-6 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
