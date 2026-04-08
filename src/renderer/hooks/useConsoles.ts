import { useState } from 'react';
import type { Dispatch, SetStateAction, MouseEvent } from 'react';
import type { ConsoleTab } from '../types/console';

type ConfirmOptions = {
  title: string;
  message: string;
  onConfirm?: () => void;
  type?: 'warning' | 'danger' | 'info';
  buttons?: { label: string; onClick: () => void; variant?: 'primary' | 'secondary' | 'danger' }[];
};

type UseConsolesArgs = {
  activeConnection: { id?: number; type?: string } | null;
  setSelectedTable: Dispatch<SetStateAction<string | null>>;
  setContextMenu: Dispatch<SetStateAction<{ x: number; y: number; type: 'table' | 'database' | 'row' | 'console'; target: string } | null>>;
  setToast: Dispatch<SetStateAction<{ message: string; type: 'error' | 'success' | 'info' } | null>>;
  confirm: (options: ConfirmOptions) => void;
};

export const useConsoles = ({
  activeConnection,
  setSelectedTable,
  setContextMenu,
  setToast,
  confirm
}: UseConsolesArgs) => {
  const [consoles, setConsoles] = useState<ConsoleTab[]>([]);
  const [activeConsoleId, setActiveConsoleId] = useState<string | null>(null);
  const [showConsoleRenameModal, setShowConsoleRenameModal] = useState(false);
  const [consoleRenameData, setConsoleRenameData] = useState({ id: '', name: '' });
  const [showLoadConsoleModal, setShowLoadConsoleModal] = useState(false);
  const [savedConsoles, setSavedConsoles] = useState<any[]>([]);

  const loadConsoles = async (connectionId?: number) => {
    try {
      const allConsoles = await window.electronAPI.getConsoles(connectionId);
      const mappedConsoles: ConsoleTab[] = allConsoles.map((c: any) => ({
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
    const consoleTab = consoles.find((c) => c.id === id);
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

      setConsoles((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name: nameToSave, isDirty: false, savedSql: c.sql } : c))
      );
      setToast({ message: '保存成功', type: 'success' });
    } catch (err: any) {
      setToast({ message: `保存失败: ${err.message}`, type: 'error' });
    }
  };

  const performClose = (id: string) => {
    const newConsoles = consoles.filter((c) => c.id !== id);
    setConsoles(newConsoles);
    if (activeConsoleId === id) {
      setActiveConsoleId(newConsoles.length > 0 ? newConsoles[0].id : null);
    }
  };

  const handleCloseConsole = async (id: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    const tab = consoles.find((c) => c.id === id);
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

  const handleNewConsole = (dbName: string, tableName?: string) => {
    const isRedis = activeConnection?.type === 'redis';
    const baseName = tableName
      ? isRedis
        ? `命令 - ${tableName}`
        : `查询 - ${tableName}`
      : isRedis
        ? `命令 - DB ${dbName}`
        : `查询 - ${dbName}`;

    let uniqueName = baseName;
    let counter = 1;
    while (consoles.some((c) => c.name === uniqueName)) {
      uniqueName = `${baseName} ${counter}`;
      counter++;
    }

    const id = Math.random().toString(36).substr(2, 9);
    const newConsole: ConsoleTab = {
      id,
      connectionId: activeConnection?.id,
      name: uniqueName,
      sql: isRedis ? 'KEYS *' : tableName ? `SELECT * FROM \`${tableName}\` LIMIT 100;` : '',
      executing: false,
      dbName,
      tableName,
      isDirty: true,
      savedSql: '',
      currentPage: 1,
      pageSize: 50
    };

    setConsoles((prev) => [...prev, newConsole]);
    setActiveConsoleId(id);
    setSelectedTable(null);
    setContextMenu(null);
  };

  const handleDeleteConsole = async (id: string) => {
    const tab = consoles.find((c) => c.id === id);
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
  };

  const handleRenameConsole = async () => {
    if (!consoleRenameData.name.trim()) return;
    setConsoles((prev) =>
      prev.map((c) => (c.id === consoleRenameData.id ? { ...c, name: consoleRenameData.name, isDirty: true } : c))
    );
    setShowConsoleRenameModal(false);
  };

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
    if (consoles.some((c) => c.id === savedTab.id)) {
      setActiveConsoleId(savedTab.id);
    } else {
      setConsoles((prev) => [...prev, { ...savedTab, isDirty: false, savedSql: savedTab.sql }]);
      setActiveConsoleId(savedTab.id);
    }
    setShowLoadConsoleModal(false);
  };

  return {
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
  };
};
