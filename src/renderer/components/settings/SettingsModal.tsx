import React from 'react';
import { motion } from 'framer-motion';
import { Bot, X, Sparkles, AlignLeft, RefreshCw, Loader2, Download, CheckCircle2, Play } from 'lucide-react';
import {
  AI_VENDOR_LIST,
  AI_VENDOR_MODELS,
  AI_VERSION_OPTIONS,
  type AiVendorId,
} from '../../../shared/aiProviderPresets';
import type { UpdateStatus } from '../../hooks/useAutoUpdate';

export type ThemeMode = 'light' | 'dark' | 'system';
export type SettingsTab = 'ai' | 'ui' | 'update';

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

const aiSelectClass =
  'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all cursor-pointer appearance-none';

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

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/20"
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-full max-w-[520px] min-w-[320px] overflow-hidden z-10"
      >
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
              className={`flex-1 text-xs font-bold rounded-xl px-3 py-2 transition-all ${
                settingsTab === 'ai'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-transparent'
              }`}
            >
              AI 功能配置
            </button>
            <button
              onClick={() => onTabChange('ui')}
              className={`flex-1 text-xs font-bold rounded-xl px-3 py-2 transition-all ${
                settingsTab === 'ui'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-transparent'
              }`}
            >
              个性化配置
            </button>
            <button
              onClick={() => onTabChange('update')}
              className={`flex-1 text-xs font-bold rounded-xl px-3 py-2 transition-all ${
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
              <select
                className={aiSelectClass}
                value={providerVendor}
                onChange={(e) => onVendorChange(e.target.value as AiVendorId)}
              >
                {AI_VENDOR_LIST.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 px-1">
                仅支持国产 API 预设地址；请求会发往 <code className="text-[11px]">…/chat/completions</code>。
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">模型</label>
              <select
                className={aiSelectClass}
                value={providerModel}
                onChange={(e) => onModelChange(e.target.value)}
              >
                {AI_VENDOR_MODELS[providerVendor].map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">API Version</label>
              <select
                className={aiSelectClass}
                value={
                  versionSelectOptions.some((o) => o.value === providerApiVersion)
                    ? providerApiVersion
                    : versionSelectOptions[0]?.value ?? ''
                }
                onChange={(e) => onApiVersionChange(e.target.value)}
              >
                {versionSelectOptions.map((o) => (
                  <option key={o.value || '_empty'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
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
              <select
                className={aiSelectClass}
                value={uiFontFamily}
                onChange={(e) => onUIFontChange(e.target.value)}
              >
                {UI_FONT_PRESETS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 px-1">点击「保存配置」后立即应用到全局界面。</p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">主题模式</label>
              <select
                className={aiSelectClass}
                value={uiThemeMode}
                onChange={(e) => onUIThemeChange(e.target.value as ThemeMode)}
              >
                <option value="system">跟随系统</option>
                <option value="light">浅色模式</option>
                <option value="dark">深色模式</option>
              </select>
              <p className="text-xs text-slate-400 px-1">当前为预览版深色模式，主要调整背景与基础文字颜色。</p>
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
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 transition-all"
          >
            取消
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSave}
            className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-600/20 transition-all"
          >
            保存配置
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default SettingsModal;
