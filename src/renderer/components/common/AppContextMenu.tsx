import React from 'react';
import { Plus, Trash2, X, Play, Activity, Sparkles, Terminal, Layout, RefreshCw, Server, Star } from 'lucide-react';
import ContextMenu from './ContextMenu';
import type { ConnectionConfig } from '../../../shared/types';

export type AppContextMenuState = { x: number; y: number; type: 'table' | 'database' | 'row' | 'console'; target: string } | null;

type AppContextMenuProps = {
  contextMenu: AppContextMenuState;
  connectionType?: ConnectionConfig['type'];
  selectedDatabase: string | null;
  insertingRow: boolean;
  deletedRows: Set<number>;
  pinnedTables: Set<string>;
  onClose: () => void;
  // 行操作
  onToggleInsertRow: () => void;
  onDeleteRow: (rowIdx: number) => void;
  // 控制台操作
  onRenameConsole: (id: string) => void;
  onDeleteConsole: (id: string) => void;
  onCloseConsole: (id: string) => void;
  // 数据库操作
  onNewConsole: (dbName: string, tableName?: string) => void;
  onOpenAIModal: (scope: 'database' | 'table', target: string) => void;
  onOpenSqlScriptPicker: (scope: 'database' | 'table', target: string) => void;
  onGenerateSchemaER: (dbName: string) => void;
  onGenerateTableER: (tableName: string) => void;
  onCreateTable: () => void;
  onRefreshDatabases: () => void;
  onExportDB: (includeData: boolean) => void;
  onDeleteDB: (dbName: string) => void;
  // 表操作
  onSelectTable: (tableName: string) => void;
  onTogglePin: (tableName: string) => void;
  onRefreshTables: () => void;
  onOpenSchemaModal: (tableName: string) => void;
  onTruncateTable: (tableName: string) => void;
  onRenameTable: (tableName: string) => void;
  onDeleteTable: (tableName: string) => void;
};

const AppContextMenu: React.FC<AppContextMenuProps> = ({
  contextMenu,
  connectionType,
  selectedDatabase,
  insertingRow,
  deletedRows,
  pinnedTables,
  onClose,
  onToggleInsertRow,
  onDeleteRow,
  onRenameConsole,
  onDeleteConsole,
  onCloseConsole,
  onNewConsole,
  onOpenAIModal,
  onOpenSqlScriptPicker,
  onGenerateSchemaER,
  onGenerateTableER,
  onCreateTable,
  onRefreshDatabases,
  onExportDB,
  onDeleteDB,
  onSelectTable,
  onTogglePin,
  onRefreshTables,
  onOpenSchemaModal,
  onTruncateTable,
  onRenameTable,
  onDeleteTable
}) => {
  if (!contextMenu) return null;
  return (
    <ContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      onClose={onClose}
      options={
        contextMenu.type === 'row' ? [
          ...(connectionType !== 'redis' ? [
            {
              label: insertingRow ? '取消添加行' : '添加行',
              icon: <Plus size={14} />,
              onClick: onToggleInsertRow
            }
          ] : []),
          ...(parseInt(contextMenu.target, 10) >= 0 ? [
            {
              label: deletedRows.has(parseInt(contextMenu.target, 10)) ? '取消删除' : '删除行',
              icon: <Trash2 size={14} />,
              onClick: () => onDeleteRow(parseInt(contextMenu.target, 10)),
              danger: !deletedRows.has(parseInt(contextMenu.target, 10))
            }
          ] : [])
        ] : contextMenu.type === 'console' ? [
          {
            label: '重命名',
            icon: <Activity size={14} />,
            onClick: () => onRenameConsole(contextMenu.target)
          },
          {
            label: '从本地删除',
            icon: <Trash2 size={14} />,
            onClick: () => onDeleteConsole(contextMenu.target),
            danger: true
          },
          {
            label: '关闭',
            icon: <X size={14} />,
            onClick: () => onCloseConsole(contextMenu.target)
          }
        ] : contextMenu.type === 'database' ? [
          {
            label: connectionType === 'redis' ? '新建命令控制台' : '新建查询控制台',
            icon: <Play size={14} />,
            onClick: () => onNewConsole(contextMenu.target)
          },
          {
            label: 'AI 助手',
            icon: <Sparkles size={14} className="text-indigo-500" />,
            onClick: () => onOpenAIModal('database', contextMenu.target)
          },
          ...(connectionType !== 'redis'
            ? [
                {
                  label: '运行 SQL 脚本',
                  icon: <Terminal size={14} />,
                  onClick: () => onOpenSqlScriptPicker('database', contextMenu.target)
                }
              ]
            : []),
          ...(connectionType !== 'redis'
            ? [
                {
                  label: '生成库 ER 图',
                  icon: <Layout size={14} className="text-blue-600" />,
                  onClick: () => onGenerateSchemaER(contextMenu.target)
                },
                {
                  label: '添加表',
                  icon: <Plus size={14} />,
                  onClick: onCreateTable
                }
              ]
            : []),
          {
            label: '刷新',
            icon: <RefreshCw size={14} />,
            onClick: onRefreshDatabases
          },
          ...(connectionType !== 'redis' ? [
            {
              label: '导出 SQL (仅结构)',
              icon: <Server size={14} />,
              onClick: () => onExportDB(false)
            },
            {
              label: '导出 SQL (结构 + 数据)',
              icon: <Server size={14} />,
              onClick: () => onExportDB(true)
            }
          ] : []),
          {
            label: connectionType === 'redis' ? '清空数据库 (Flush)' : '删除数据库',
            icon: <Trash2 size={14} />,
            onClick: () => onDeleteDB(contextMenu.target),
            danger: true
          },
        ] : [
          {
            label: connectionType === 'redis' ? '查看 Key 内容' : '打开表',
            icon: <Play size={14} />,
            onClick: () => onSelectTable(contextMenu.target)
          },
          {
            label: '新建查询控制台',
            icon: <Play size={14} />,
            onClick: () => onNewConsole(selectedDatabase!, contextMenu.target)
          },
          {
            label: 'AI 助手',
            icon: <Sparkles size={14} className="text-indigo-500" />,
            onClick: () => onOpenAIModal('table', contextMenu.target)
          },
          ...(connectionType !== 'redis'
            ? [
                {
                  label: '运行 SQL 脚本',
                  icon: <Terminal size={14} />,
                  onClick: () => onOpenSqlScriptPicker('table', contextMenu.target)
                }
              ]
            : []),
          {
            label: '生成 ER 图',
            icon: <Layout size={14} className="text-blue-600" />,
            onClick: () => onGenerateTableER(contextMenu.target)
          },
          // 表置顶切换
          {
            label: pinnedTables.has(contextMenu.target) ? '取消置顶' : '置顶',
            icon: <Star size={14} className={pinnedTables.has(contextMenu.target) ? 'text-amber-400' : 'text-slate-400'} fill={pinnedTables.has(contextMenu.target) ? 'currentColor' : 'none'} />,
            onClick: () => onTogglePin(contextMenu.target),
          },
          {
            label: '刷新列表',
            icon: <RefreshCw size={14} />,
            onClick: onRefreshTables
          },
          ...(connectionType === 'redis' ? [
            ...(contextMenu.target !== 'Keys' ? [
              {
                label: '删除 Key',
                icon: <Trash2 size={14} />,
                onClick: () => onDeleteTable(contextMenu.target),
                danger: true
              }
            ] : [])
          ] : [
            {
              label: '修改表结构',
              icon: <Activity size={14} />,
              onClick: () => onOpenSchemaModal(contextMenu.target)
            },
            {
              label: '清空表',
              icon: <Trash2 size={14} />,
              onClick: () => onTruncateTable(contextMenu.target),
              danger: true
            },
            {
              label: '重命名',
              icon: <RefreshCw size={14} />,
              onClick: () => onRenameTable(contextMenu.target)
            },
            {
              label: '删除表',
              icon: <Trash2 size={14} />,
              onClick: () => onDeleteTable(contextMenu.target),
              danger: true
            }
          ])
        ]
      }
    />
  );
};

export default AppContextMenu;
