import React from 'react';
import { motion } from 'framer-motion';
import { Bot, X, Sparkles, AlignLeft, RefreshCw, Loader2, Download, CheckCircle2, Play, Plug, Copy, ShieldAlert } from 'lucide-react';
import {
  AI_VENDOR_LIST,
  AI_VENDOR_MODELS,
  AI_VERSION_OPTIONS,
  type AiVendorId,
} from '../../../shared/aiProviderPresets';
import type { UpdateStatus } from '../../hooks/useAutoUpdate';
import { Modal, Button, Switch, Select } from '../../ui';

export type ThemeMode = 'light' | 'dark' | 'system';
export type SettingsTab = 'ai' | 'ui' | 'mcp' | 'update';

export const DEFAULT_UI_FONT_STACK = "'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif";

const UI_FONT_PRESETS: { label: string; value: string }[] = [
  { label: '默认（Inter / 中英混排）', value: DEFAULT_UI_FONT_STACK },
  { label: 'Microsoft YaHei', value: "'Microsoft YaHei', 'PingFang SC', sans-serif" },
  { label: 'PingFang SC', value: "'PingFang SC', 'Microsoft YaHei', sans-serif" },
  { label: 'Noto Sans SC', value: "'Noto Sans SC', 'Microsoft YaHei', sans-serif" },
  { label: 'Segoe UI', value: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
  { label: 'Roboto', value: "'Roboto', 'Segoe UI', sans-serif" },
  { label: 'Consolas（等宽）', value: "'Consolas', 'Courier New', monospace" },
  { label: 'Courier New（等宽）', value: "'Courier New', monospace" },
];

type SettingsModalProps = {
  settingsTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  providerVendor: AiVendorId;
  onVendorChange: (vendor: AiVendorId) => void;
  providerModel: string;
  onModelChange: (model: string) => void;
  providerApiVersion: string;
  onApiVersionChange: (version: string) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  showApiKeyPlain: boolean;
  onToggleApiKeyPlain: () => void;
  uiFontFamily: string;
  onUIFontChange: (font: string) => void;
  uiThemeMode: ThemeMode;
  onUIThemeChange: (mode: ThemeMode) => void;
  appVersion: string;
  updateStatus: UpdateStatus;
  onCheckUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
  onClose: () => void;
  onSave: () => void;
};

const SettingsModal: React.FC<SettingsModalProps> = ({
  settingsTab,
  onTabChange,
  providerVendor,
  onVendorChange,
  providerModel,
  onModelChange,
  providerApiVersion,
  onApiVersionChange,
  apiKey,
  onApiKeyChange,
  showApiKeyPlain,
  onToggleApiKeyPlain,
  uiFontFamily,
  onUIFontChange,
  uiThemeMode,
  onUIThemeChange,
  appVersion,
  updateStatus,
  onCheckUpdates,
  onDownloadUpdate,
  onInstallUpdate,
  onClose,
  onSave
}) => {
  const versionSelectOptions = React.useMemo(() => {
    const opts = [...AI_VERSION_OPTIONS[providerVendor]];
    if (providerApiVersion && !opts.some((o) => o.value === providerApiVersion)) {
      opts.push({ value: providerApiVersion, label: `${providerApiVersion}（当前）` });
    }
    return opts;
  }, [providerVendor, providerApiVersion]);

  // ── MCP 服务状态（自包含：仅在该标签页挂载时拉取）────────────────
  const [mcpStatus, setMcpStatus] = React.useState<{
    running: boolean;
    port: number;
    endpointFile: string;
    allowWrite?: boolean;
  } | null>(null);
  const [mcpBusy, setMcpBusy] = React.useState(false);
  const [mcpCopied, setMcpCopied] = React.useState(false);
  const [mcpConfig, setMcpConfig] = React.useState('');

  React.useEffect(() => {
    if (settingsTab !== 'mcp') return;
    let alive = true;
    window.electronAPI
      .mcpGetStatus()
      .then((status) => {
        if (alive) setMcpStatus(status);
      })
      .catch(() => {
        if (alive) setMcpStatus(null);
      });
    // 桥路径由主进程按运行环境计算，前端不硬编码
    window.electronAPI
      .mcpGetClientConfig()
      .then((res) => {
        if (alive) setMcpConfig(res.config);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [settingsTab]);

  const toggleMcpServer = async (next: boolean) => {
    setMcpBusy(true);
    try {
      const result = await window.electronAPI.mcpSetEnabled(next);
      setMcpStatus(result);
    } catch {
      // 失败时保持原状态，错误由主进程日志体现
    } finally {
      setMcpBusy(false);
    }
  };

  const toggleMcpWrite = async (next: boolean) => {
    setMcpBusy(true);
    try {
      const result = await window.electronAPI.mcpSetAllowWrite(next);
      setMcpStatus((prev) => (prev ? { ...prev, allowWrite: result.allowWrite } : prev));
    } finally {
      setMcpBusy(false);
    }
  };

  const copyMcpConfig = async () => {
    try {
      await navigator.clipboard.writeText(mcpConfig);
      setMcpCopied(true);
      setTimeout(() => setMcpCopied(false), 1500);
    } catch {
      // 剪贴板不可用时静默失败，用户可手动选中复制
    }
  };

  return (
    <Modal onClose={onClose} zIndex={110} ariaLabel="系统设置">
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-slate-50 to-transparent">
          <div className="flex items-center gap-2">
            <Bot size={20} className="text-indigo-600" />
            <h3 className="font-bold text-lg text-slate-900 tracking-tight">系统设置</h3>
          </div>
          <motion.button
            whileHover={{ rotate: 90, scale: 1.1 }}
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
          >
            <X size={16} />
          </motion.button>
        </div>

        <div className="p-8 space-y-6 max-h-[min(70vh,640px)] overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-1">
            <button
              onClick={() => onTabChange('ai')}
              className={`flex-1 text-xs font-bold rounded-xl px-2 py-2 transition-all whitespace-nowrap ${
                settingsTab === 'ai'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-transparent'
              }`}
            >
              AI 配置
            </button>
            <button
              onClick={() => onTabChange('ui')}
              className={`flex-1 text-xs font-bold rounded-xl px-2 py-2 transition-all whitespace-nowrap ${
                settingsTab === 'ui'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-transparent'
              }`}
            >
              个性化
            </button>
            <button
              onClick={() => onTabChange('mcp')}
              className={`flex-1 text-xs font-bold rounded-xl px-2 py-2 transition-all whitespace-nowrap ${
                settingsTab === 'mcp'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-transparent'
              }`}
            >
              MCP 服务
            </button>
            <button
              onClick={() => onTabChange('update')}
              className={`flex-1 text-xs font-bold rounded-xl px-2 py-2 transition-all whitespace-nowrap ${
                settingsTab === 'update'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-transparent'
              }`}
            >
              软件更新
            </button>
          </div>

          {/* AI Section */}
          <div className={`space-y-4 ${settingsTab === 'ai' ? '' : 'hidden'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-indigo-500" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">AI 功能配置</span>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">厂商</label>
              <Select
                ariaLabel="AI 厂商"
                size="lg"
                value={providerVendor}
                onChange={(next) => onVendorChange(next as AiVendorId)}
                options={AI_VENDOR_LIST.map((v) => ({ value: v.id, label: v.label }))}
              />
              <p className="text-xs text-slate-400 px-1">
                仅支持国产 API 预设地址；请求会发往 <code className="text-[11px]">…/chat/completions</code>。
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">模型</label>
              <Select
                ariaLabel="模型"
                size="lg"
                value={providerModel}
                onChange={onModelChange}
                options={AI_VENDOR_MODELS[providerVendor].map((m) => ({ value: m.value, label: m.label }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">API Version</label>
              <Select
                ariaLabel="API Version"
                size="lg"
                value={
                  versionSelectOptions.some((o) => o.value === providerApiVersion)
                    ? providerApiVersion
                    : versionSelectOptions[0]?.value ?? ''
                }
                onChange={onApiVersionChange}
                options={versionSelectOptions.map((o) => ({ value: o.value, label: o.label }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                API Key（Bearer）
              </label>
              <div className="relative">
                <input
                  type={showApiKeyPlain ? 'text' : 'password'}
                  autoFocus
                  placeholder="sk-..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 pr-14 text-slate-900 focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all"
                  value={apiKey}
                  onChange={(e) => onApiKeyChange(e.target.value)}
                />
                <button
                  type="button"
                  onClick={onToggleApiKeyPlain}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-white/70 hover:bg-white border border-slate-200 rounded-xl px-2 py-1 transition-colors"
                  aria-label={showApiKeyPlain ? '隐藏 API Key' : '显示 API Key'}
                >
                  {showApiKeyPlain ? '隐藏' : '显示'}
                </button>
              </div>
              <p className="text-xs text-slate-400 px-1">
                所有国产兼容网关均使用 Bearer 鉴权。
              </p>
            </div>
          </div>

          {/* UI Font Section */}
          <div className={`pt-6 border-t border-slate-100 space-y-4 ${settingsTab === 'ui' ? '' : 'hidden'}`}>
            <div className="flex items-center gap-2 mb-2">
              <AlignLeft size={14} className="text-indigo-500" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">界面字体</span>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">字体族</label>
              <Select
                ariaLabel="界面字体族"
                size="lg"
                value={uiFontFamily}
                onChange={onUIFontChange}
                options={UI_FONT_PRESETS.map((f) => ({ value: f.value, label: f.label }))}
              />
              <p className="text-xs text-slate-400 px-1">点击「保存配置」后立即应用到全局界面。</p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">主题模式</label>
              <Select
                ariaLabel="主题模式"
                size="lg"
                value={uiThemeMode}
                onChange={(next) => onUIThemeChange(next as ThemeMode)}
                options={[
                  { value: 'system', label: '跟随系统' },
                  { value: 'light', label: '浅色模式' },
                  { value: 'dark', label: '深色模式' },
                ]}
              />
              <p className="text-xs text-slate-400 px-1">当前为预览版深色模式，主要调整背景与基础文字颜色。</p>
            </div>
          </div>

          {/* MCP Section */}
          <div className={`pt-6 border-t border-slate-100 space-y-4 ${settingsTab === 'mcp' ? '' : 'hidden'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Plug size={14} className="text-indigo-500" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">MCP 服务</span>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900">启用本地 MCP 服务</span>
                    {mcpStatus?.running ? (
                      <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold">
                        运行中 · 127.0.0.1:{mcpStatus.port}
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 bg-slate-200 text-slate-500 rounded-full font-bold">
                        已停止
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    让 Cursor、Claude Code 等 MCP 客户端访问本机已保存的数据库连接。服务仅监听 127.0.0.1，
                    用一次性 token 鉴权，凭证不会离开本机。
                  </p>
                </div>
                <Switch
                  checked={!!mcpStatus?.running}
                  onChange={toggleMcpServer}
                  disabled={mcpBusy}
                  label="启用本地 MCP 服务"
                />
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={14} className="text-amber-500" />
                    <span className="text-sm font-bold text-slate-900">允许写操作</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    开启后模型可执行 INSERT / UPDATE / DELETE / DDL，且仅对非只读连接生效。
                    MCP 客户端无法弹窗确认，建议只在明确需要时临时开启。
                  </p>
                </div>
                <Switch
                  checked={!!mcpStatus?.allowWrite}
                  onChange={toggleMcpWrite}
                  disabled={mcpBusy || !mcpStatus?.running}
                  tone="amber"
                  label="允许 MCP 写操作"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  客户端配置
                </label>
                <button
                  type="button"
                  onClick={copyMcpConfig}
                  className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-indigo-600 transition-colors"
                >
                  <Copy size={12} />
                  {mcpCopied ? '已复制' : '复制'}
                </button>
              </div>
              <pre className="text-[11px] leading-relaxed bg-slate-900 text-slate-100 rounded-2xl p-4 overflow-x-auto font-mono">
                {mcpConfig || '加载中…'}
              </pre>
              <p className="text-xs text-slate-400 px-1 leading-relaxed">
                配置里没有密钥是正常的：token 由 AiSqlBoy 每次启动随机生成，桥进程会自动从本机端点文件读取，
                不经过客户端配置文件。写入后重启客户端即可生效。Windows 路径中的反斜杠已按 JSON 转义。
              </p>
            </div>
          </div>

          {/* Update Section */}
          <div className={`pt-6 border-t border-slate-100 space-y-4 ${settingsTab === 'update' ? '' : 'hidden'}`}>
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

                {['idle', 'not-available', 'error'].includes(updateStatus.type) ? (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onCheckUpdates}
                    disabled={updateStatus.type === 'checking'}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {(updateStatus.type as string) === 'checking' ? (
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
                      onClick={onDownloadUpdate}
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
                    onClick={onInstallUpdate}
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
          <Button size="lg" variant="ghost" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button size="lg" variant="primary" className="flex-[2]" onClick={onSave}>
            保存配置
          </Button>
        </div>
    </Modal>
  );
};

export default SettingsModal;
