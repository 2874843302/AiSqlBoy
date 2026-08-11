import React from 'react';
import { motion } from 'framer-motion';
import { X, PackagePlus } from 'lucide-react';
import { ConnectionConfig } from '../../../shared/types';

type ConnectionModalProps = {
  config: ConnectionConfig;
  onChange: (config: ConnectionConfig) => void;
  onClose: () => void;
  onSave: () => void;
  onExportPackage?: (config: ConnectionConfig) => void;
};

const ConnectionModal: React.FC<ConnectionModalProps> = ({ config, onChange, onClose, onSave, onExportPackage }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
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
        className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-[480px] overflow-hidden z-10"
      >
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-slate-50 to-transparent">
          <div>
            <h3 className="font-bold text-xl text-slate-900 tracking-tight">新建连接</h3>
            <p className="text-xs text-slate-500 mt-1 font-semibold">配置您的数据库连接信息</p>
          </div>
          <motion.button
            whileHover={{ rotate: 90, scale: 1.1 }}
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
          >
            <X size={20} />
          </motion.button>
        </div>

        <div className="p-8 space-y-6">
          <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
            <button
              onClick={() => onChange({ ...config, type: 'mysql', port: 3306 })}
              className={`flex-1 min-w-[4.5rem] py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                config.type === 'mysql' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              MySQL
            </button>
            <button
              onClick={() => onChange({ ...config, type: 'postgresql', port: 5432 })}
              className={`flex-1 min-w-[4.5rem] py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                config.type === 'postgresql' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              PostgreSQL
            </button>
            <button
              onClick={() => onChange({ ...config, type: 'oracle', port: 1521 })}
              className={`flex-1 min-w-[4.5rem] py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                config.type === 'oracle' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Oracle
            </button>
            <button
              onClick={() => onChange({ ...config, type: 'sqlite' })}
              className={`flex-1 min-w-[4.5rem] py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                config.type === 'sqlite' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              SQLite
            </button>
            <button
              onClick={() => onChange({ ...config, type: 'redis', port: 6379 })}
              className={`flex-1 min-w-[4.5rem] py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                config.type === 'redis' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
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
                value={config.name}
                onChange={(e) => onChange({ ...config, name: e.target.value })}
              />
            </div>

            {config.type !== 'sqlite' ? (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">主机地址</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                      value={config.host}
                      onChange={(e) => onChange({ ...config, host: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">端口</label>
                    <input
                      type="number"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                      value={config.port}
                      onChange={(e) => onChange({ ...config, port: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">用户名</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                      value={config.user}
                      onChange={(e) => onChange({ ...config, user: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">密码</label>
                    <input
                      type="password"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                      value={config.password}
                      onChange={(e) => onChange({ ...config, password: e.target.value })}
                    />
                  </div>
                </div>
                {config.type !== 'redis' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                      {config.type === 'oracle' ? '服务名 Service Name（必填）' : '数据库 (可选)'}
                    </label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                      placeholder={
                        config.type === 'oracle'
                          ? '如 XEPDB1、ORCLPDB1（用于 host:port/服务名）'
                          : '例如: user_db'
                      }
                      value={config.database}
                      onChange={(e) => onChange({ ...config, database: e.target.value })}
                    />
                    {config.type === 'oracle' && (
                      <p className="text-xs text-slate-400 px-1">
                        连接成功后，侧栏「数据库」下列出的是可访问的 schema；展开后选择 schema 再浏览表。
                      </p>
                    )}
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
                  value={config.database}
                  onChange={(e) => onChange({ ...config, database: e.target.value })}
                />
              </div>
            )}
          </div>
        </div>

        {/* 只读模式开关：仅新建连接时可选，已有连接不可回改 */}
        {config.id == null && (
          <div className="px-8 pb-5">
            <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50/50 cursor-pointer hover:bg-amber-50 transition-colors">
              <input
                type="checkbox"
                checked={!!config.readOnly}
                onChange={(e) => onChange({ ...config, readOnly: e.target.checked })}
                className="w-4 h-4 accent-amber-500"
              />
              <div>
                <div className="text-sm font-bold text-amber-700">只读模式</div>
                <div className="text-xs text-amber-600/80">仅允许查询，禁止数据修改、结构变更与导出等一切写操作</div>
              </div>
            </label>
          </div>
        )}

        {/* 只读分享：导出加密连接包 */}
        <div className="px-8 pb-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">只读分享</div>
            {config.id != null && onExportPackage && (
              <button
                onClick={() => onExportPackage(config)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors"
              >
                <PackagePlus size={14} />
                导出只读包
              </button>
            )}
          </div>
        </div>
        <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 transition-all"
          >
            取消
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSave}
            className="flex-[2] py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-blue-600/20 transition-all"
          >
            保存连接
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default ConnectionModal;
