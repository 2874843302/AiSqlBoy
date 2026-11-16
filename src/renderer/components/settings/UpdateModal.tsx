import React from 'react';
import { motion } from 'framer-motion';
import { X, Sparkles, ArrowUp, CheckCircle2, Download, Play } from 'lucide-react';
import type { UpdateStatus } from '../../hooks/useAutoUpdate';
import { Modal, Button } from '../../ui';

type UpdateModalProps = {
  updateStatus: UpdateStatus;
  onClose: () => void;
  onDownload: () => void;
  onInstall: () => void;
};

const UpdateModal: React.FC<UpdateModalProps> = ({ updateStatus, onClose, onDownload, onInstall }) => {
  const downloading = updateStatus.type === 'downloading';

  return (
    <Modal
      onClose={onClose}
      zIndex={120}
      backdropClassName="bg-slate-900/40"
      width="w-[400px]"
      ariaLabel="发现新版本"
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
            onClick={onClose}
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
          <Button size="lg" variant="ghost" className="flex-1" onClick={onClose} disabled={downloading}>
            稍后再说
          </Button>
          {updateStatus.type === 'downloaded' ? (
            <Button size="lg" variant="success" className="flex-[2]" icon={<Play size={16} />} onClick={onInstall}>
              立即重启安装
            </Button>
          ) : (
            <Button
              size="lg"
              variant="primary"
              className="flex-[2]"
              icon={<Download size={16} />}
              onClick={onDownload}
              disabled={downloading}
            >
              {downloading ? '正在下载...' : '立即下载更新'}
            </Button>
          )}
        </div>
    </Modal>
  );
};

export default UpdateModal;
