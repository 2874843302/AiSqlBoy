import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Lock, PackageOpen, PackagePlus, Database, Check } from 'lucide-react';

type ConnectionPackageModalProps = {
  mode: 'export' | 'import';
  connectionName?: string;
  /** 导出模式：可选授权的数据库列表（多选） */
  databases?: string[];
  /** 导出模式：默认勾选的数据库（当前选中的库） */
  defaultDatabase?: string;
  loading?: boolean;
  error?: string;
  onClose: () => void;
  /** expiresAt / allowedDatabases 仅导出模式传回 */
  onConfirm: (passphrase: string, expiresAt?: number, allowedDatabases?: string[]) => void;
};

const MIN_VALID_DAYS = 1;
const MAX_VALID_DAYS = 365;

const ConnectionPackageModal: React.FC<ConnectionPackageModalProps> = ({
  mode,
  connectionName,
  databases,
  defaultDatabase,
  loading,
  error,
  onClose,
  onConfirm
}) => {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [validDays, setValidDays] = useState('7');
  // 授权库多选：默认勾选当前选中的库
  const [selectedDbs, setSelectedDbs] = useState<Set<string>>(
    () => new Set(defaultDatabase && databases?.includes(defaultDatabase) ? [defaultDatabase] : [])
  );

  const toggleDb = (db: string) => {
    setSelectedDbs((prev) => {
      const next = new Set(prev);
      if (next.has(db)) next.delete(db);
      else next.add(db);
      return next;
    });
  };

  const isExport = mode === 'export';
  const daysNum = parseInt(validDays, 10);
  const daysValid = Number.isFinite(daysNum) && daysNum >= MIN_VALID_DAYS && daysNum <= MAX_VALID_DAYS;
  const canSubmit =
    passphrase.length > 0 &&
    (mode === 'import' || passphrase === confirmPass) &&
    (!isExport || (daysValid && selectedDbs.size > 0)) &&
    !loading;

  const submit = () => {
    if (!passphrase) return;
    if (isExport && passphrase !== confirmPass) {
      setMismatch(true);
      return;
    }
    if (isExport && (!daysValid || selectedDbs.size === 0)) return;
    setMismatch(false);
    // 有效期与授权库白名单写入密文，到期后包与导入的连接同时失效
    onConfirm(
      passphrase,
      isExport ? Date.now() + daysNum * 24 * 60 * 60 * 1000 : undefined,
      isExport ? Array.from(selectedDbs) : undefined
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

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
        onKeyDown={handleKeyDown}
        className="bg-white border border-slate-200 rounded-[32px] shadow-2xl w-[440px] overflow-hidden z-10"
      >
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-b from-amber-50/60 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
              {isExport ? <PackagePlus size={20} /> : <PackageOpen size={20} />}
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900 tracking-tight">
                {isExport ? '导出只读连接包' : '导入只读连接包'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-semibold">
                {isExport
                  ? connectionName
                    ? `为连接「${connectionName}」设置打开口令`
                    : '设置连接包的打开口令'
                  : '输入连接包的打开口令以解密导入'}
              </p>
            </div>
          </div>
          <motion.button
            whileHover={{ rotate: 90, scale: 1.1 }}
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
          >
            <X size={20} />
          </motion.button>
        </div>

        <div className="p-8 space-y-5">
          {isExport && databases && databases.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  授权数据库（可多选）
                </label>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                      selectedDbs.size > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    已选 {selectedDbs.size} / {databases.length}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDbs(
                        selectedDbs.size === databases.length ? new Set() : new Set(databases)
                      )
                    }
                    className="text-[11px] font-bold text-amber-600 hover:text-amber-700 transition-colors"
                  >
                    {selectedDbs.size === databases.length ? '清空' : '全选'}
                  </button>
                </div>
              </div>
              <div className="max-h-44 overflow-y-auto bg-slate-50/70 border border-slate-200 rounded-2xl p-1.5 space-y-1">
                {databases.map((db) => {
                  const selected = selectedDbs.has(db);
                  return (
                    <label
                      key={db}
                      className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer select-none border transition-all ${
                        selected
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-100/60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={selected}
                        onChange={() => toggleDb(db)}
                      />
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                          selected
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200/70'
                        }`}
                      >
                        <Database size={14} />
                      </span>
                      <span
                        className={`flex-1 text-sm font-semibold truncate ${
                          selected ? 'text-slate-900' : 'text-slate-600'
                        }`}
                      >
                        {db}
                      </span>
                      <span
                        className={`w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                          selected
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'border-slate-300 bg-white text-transparent'
                        }`}
                      >
                        <Check size={12} strokeWidth={3.5} />
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 px-1">
                接收方只能访问选中的 {selectedDbs.size} 个数据库，无法查看或操作其他库
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
              {isExport ? '打开口令' : '连接包口令'}
            </label>
            <input
              type="password"
              autoFocus
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
              placeholder={isExport ? '接收方需要此口令才能导入' : '请输入口令'}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </div>

          {isExport && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                连接包有效期（天）
              </label>
              <input
                type="number"
                min={MIN_VALID_DAYS}
                max={MAX_VALID_DAYS}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
                value={validDays}
                onChange={(e) => setValidDays(e.target.value)}
              />
              {!daysValid && (
                <p className="text-xs font-semibold text-red-500 px-1">
                  请输入 {MIN_VALID_DAYS} 至 {MAX_VALID_DAYS} 之间的天数
                </p>
              )}
            </div>
          )}

          {isExport && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                确认口令
              </label>
              <input
                type="password"
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
                placeholder="再次输入口令"
                value={confirmPass}
                onChange={(e) => {
                  setConfirmPass(e.target.value);
                  setMismatch(false);
                }}
              />
            </div>
          )}

          {mismatch && (
            <p className="text-xs font-semibold text-red-500 px-1">两次输入的口令不一致</p>
          )}
          {error && <p className="text-xs font-semibold text-red-500 px-1">{error}</p>}

          <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50/60 border border-amber-100 text-amber-700">
            <Lock size={14} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed">
              {isExport
                ? `连接包将强制以只读模式导出，仅授权访问选中的 ${selectedDbs.size || '?'} 个数据库，${daysValid ? daysNum : '?'} 天后过期；接收方无法改为可写、无法访问其他库，到期后连接自动失效。`
                : '导入的连接将强制为只读并锁定配置，仅允许在有效期内查询包内授权的数据库。'}
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 transition-all"
            >
              取消
            </button>
            <motion.button
              whileHover={canSubmit ? { scale: 1.02 } : undefined}
              whileTap={canSubmit ? { scale: 0.98 } : undefined}
              onClick={submit}
              disabled={!canSubmit}
              className={`flex-[2] py-3.5 rounded-2xl text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${
                canSubmit
                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              }`}
            >
              {loading && (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {isExport ? '加密导出' : '解密导入'}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ConnectionPackageModal;
