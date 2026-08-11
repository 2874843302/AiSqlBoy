import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Lock, PackageOpen, PackagePlus } from 'lucide-react';

type ConnectionPackageModalProps = {
  mode: 'export' | 'import';
  connectionName?: string;
  loading?: boolean;
  error?: string;
  onClose: () => void;
  /** expiresAt 仅导出模式传回（毫秒时间戳） */
  onConfirm: (passphrase: string, expiresAt?: number) => void;
};

const MIN_VALID_DAYS = 1;
const MAX_VALID_DAYS = 365;

const ConnectionPackageModal: React.FC<ConnectionPackageModalProps> = ({
  mode,
  connectionName,
  loading,
  error,
  onClose,
  onConfirm
}) => {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [validDays, setValidDays] = useState('7');

  const isExport = mode === 'export';
  const daysNum = parseInt(validDays, 10);
  const daysValid = Number.isFinite(daysNum) && daysNum >= MIN_VALID_DAYS && daysNum <= MAX_VALID_DAYS;
  const canSubmit =
    passphrase.length > 0 && (mode === 'import' || passphrase === confirmPass) && (!isExport || daysValid) && !loading;

  const submit = () => {
    if (!passphrase) return;
    if (isExport && passphrase !== confirmPass) {
      setMismatch(true);
      return;
    }
    if (isExport && !daysValid) return;
    setMismatch(false);
    // 有效期写入密文，到期后包与导入的连接同时失效
    onConfirm(passphrase, isExport ? Date.now() + daysNum * 24 * 60 * 60 * 1000 : undefined);
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
                ? `连接包将强制以只读模式导出，${daysValid ? daysNum : '?'} 天后过期；接收方导入后无法改为可写，到期后连接自动失效。`
                : '导入的连接将强制为只读并锁定配置，仅允许在有效期内查询数据。'}
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
