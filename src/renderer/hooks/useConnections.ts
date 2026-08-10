import { useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { ConnectionConfig } from '../../shared/types';

interface UseConnectionsOptions {
  confirm: (options: {
    title: string;
    message: string;
    onConfirm?: () => void;
    type?: 'warning' | 'danger' | 'info';
    buttons?: { label: string; onClick: () => void; variant?: 'primary' | 'secondary' | 'danger' }[];
  }) => void;
  setToast: (toast: { message: string; type: 'error' | 'success' | 'info' }) => void;
  selectedDatabase: string | null;
  setDatabases: (dbs: string[]) => void;
  setSelectedDatabase: (db: string | null) => void;
  setTables: (tables: { name: string }[]) => void;
  setSelectedTable: (t: string | null) => void;
  setData: (data: any[]) => void;
  setColumns: (cols: any[]) => void;
}

export const useConnections = ({
  confirm,
  setToast,
  selectedDatabase,
  setDatabases,
  setSelectedDatabase,
  setTables,
  setSelectedTable,
  setData,
  setColumns
}: UseConnectionsOptions) => {
  const [savedConnections, setSavedConnections] = useState<ConnectionConfig[]>([])
  const [activeConnection, setActiveConnection] = useState<ConnectionConfig | null>(null)
  const [connectingConnectionId, setConnectingConnectionId] = useState<number | null>(null)
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
  const [showSchemaFilterModal, setShowSchemaFilterModal] = useState(false);
  const [schemaFilterDraft, setSchemaFilterDraft] = useState<string[]>([]);

  const loadSavedConnections = async () => {
    const connections = await window.electronAPI.getSavedConnections()
    setSavedConnections(connections)
  }

  const getConnectionValidationError = (config: ConnectionConfig): string | null => {
    const name = (config.name || '').trim();
    const host = (config.host || '').trim();
    const user = (config.user || '').trim();
    const password = config.password ?? '';
    const database = (config.database || '').trim();
    const port = Number(config.port);
    const needsHostConfig = config.type !== 'sqlite';
    const needsUser = config.type === 'mysql' || config.type === 'postgresql' || config.type === 'oracle';
    const needsPassword = config.type === 'mysql' || config.type === 'postgresql' || config.type === 'oracle';

    if (!name) {
      return '请输入连接名称'
    }

    if (config.type === 'sqlite') {
      if (!database) {
        return '请输入 SQLite 数据库文件路径'
      }
      return null
    }

    if (needsHostConfig) {
      if (!host) {
        return config.type === 'redis' ? '请输入 Redis 主机地址' : '请输入数据库主机地址'
      }
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return '请输入有效端口，范围为 1-65535'
      }
    }

    if (needsUser && !user) {
      if (config.type === 'oracle') {
        return '请输入 Oracle 用户名'
      }
      if (config.type === 'postgresql') {
        return '请输入 PostgreSQL 用户名'
      }
      return '请输入数据库用户名'
    }

    if (needsPassword && !String(password).trim()) {
      if (config.type === 'oracle') {
        return '请输入 Oracle 密码'
      }
      if (config.type === 'postgresql') {
        return '请输入 PostgreSQL 密码'
      }
      return '请输入数据库密码'
    }

    if (config.type === 'oracle' && !database) {
      return '请输入 Oracle Service Name'
    }

    return null
  }

  const handleSaveConnection = async () => {
    try {
      const dbName = (newConfig.database || '').trim();
      const configToSave: ConnectionConfig = {
        ...newConfig,
        name: (newConfig.name || '').trim(),
        host: (newConfig.host || '').trim(),
        user: (newConfig.user || '').trim(),
        password: newConfig.password || '',
        database: dbName
      };

      const validationError = getConnectionValidationError(configToSave)
      if (validationError) {
        setToast({ message: validationError, type: 'error' })
        return
      }

      // 新建连接时：如果填写了数据库名，默认只筛选该库/Schema
      if (!isEditingConnection && dbName && newConfig.type !== 'sqlite' && newConfig.type !== 'redis') {
        configToSave.selectedSchemas = [dbName];
      }

      const validateResult = await window.electronAPI.validateConnection(configToSave)
      if (!validateResult.success) {
        setToast({ message: validateResult.error || '连接验证失败', type: 'error' })
        return
      }

      await window.electronAPI.saveConnection(configToSave)
      setShowAddModal(false)
      setIsEditingConnection(false)
      loadSavedConnections()
    } catch (err: any) {
      setToast({ message: err?.message || '保存连接失败', type: 'error' })
    }
  }

  const handleEditConnection = (conn: ConnectionConfig, e: ReactMouseEvent) => {
    e.stopPropagation()
    setNewConfig({ ...conn })
    setIsEditingConnection(true)
    setShowAddModal(true)
  }

  const handleDeleteConnection = async (id: number, e: ReactMouseEvent) => {
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

  const handleOpenSchemaFilterModal = () => {
    if (!activeConnection) return;
    setSchemaFilterDraft(activeConnection.selectedSchemas ? [...activeConnection.selectedSchemas] : []);
    setShowSchemaFilterModal(true);
  };

  const handleSaveSchemaFilter = async () => {
    if (!activeConnection?.id) return;
    const nextSelected = schemaFilterDraft.filter((v, i, arr) => arr.indexOf(v) === i);
    const nextConn: ConnectionConfig = { ...activeConnection, selectedSchemas: nextSelected };
    await window.electronAPI.saveConnection(nextConn);
    setActiveConnection(nextConn);
    setSavedConnections((prev) => prev.map((c) => (c.id === nextConn.id ? { ...c, selectedSchemas: nextSelected } : c)));

    const allowAll = nextSelected.length === 0;
    const allowSet = new Set(nextSelected);
    if (selectedDatabase && !allowAll && !allowSet.has(selectedDatabase)) {
      setSelectedDatabase(null);
      setSelectedTable(null);
      setTables([]);
      setExpandedDatabases(new Set());
      setData([]);
      setColumns([]);
    }
    setShowSchemaFilterModal(false);
    setToast({ message: nextSelected.length > 0 ? `已选择 ${nextSelected.length} 个数据库架构` : '已切换为显示全部数据库架构', type: 'success' });
  };

  return {
    savedConnections,
    setSavedConnections,
    activeConnection,
    setActiveConnection,
    connectingConnectionId,
    setConnectingConnectionId,
    showAddModal,
    setShowAddModal,
    isEditingConnection,
    setIsEditingConnection,
    expandedConnections,
    setExpandedConnections,
    expandedDatabases,
    setExpandedDatabases,
    newConfig,
    setNewConfig,
    showSchemaFilterModal,
    setShowSchemaFilterModal,
    schemaFilterDraft,
    setSchemaFilterDraft,
    loadSavedConnections,
    getConnectionValidationError,
    handleSaveConnection,
    handleEditConnection,
    handleDeleteConnection,
    handleOpenSchemaFilterModal,
    handleSaveSchemaFilter
  };
};
