import { useEffect, useState } from 'react';

export type UpdateStatus = {
  type: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'not-available';
  message?: string;
  progress?: number;
  info?: any;
};

export const useAutoUpdate = () => {
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ type: 'idle' });
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  useEffect(() => {
    window.electronAPI.getAppVersion().then(setAppVersion);

    window.electronAPI.onUpdateMessage((message) => {
      setUpdateStatus((prev) => ({ ...prev, message }));
    });

    window.electronAPI.onUpdateAvailable((info) => {
      setUpdateStatus({ type: 'available', info, message: `新版本 v${info.version} 已就绪` });
      setShowUpdateModal(true);
    });

    window.electronAPI.onUpdateNotAvailable(() => {
      setUpdateStatus({ type: 'not-available', message: '当前已是最新版本' });
    });

    window.electronAPI.onDownloadProgress((progress) => {
      setUpdateStatus((prev) => ({
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
  }, []);

  const handleCheckUpdates = async () => {
    setUpdateStatus({ type: 'checking', message: '正在检查更新...' });
    await window.electronAPI.checkForUpdates();
  };

  const handleDownloadUpdate = async () => {
    setUpdateStatus((prev) => ({ ...prev, type: 'downloading', message: '开始下载更新...' }));
    await window.electronAPI.downloadUpdate();
  };

  const handleInstallUpdate = async () => {
    await window.electronAPI.quitAndInstall();
  };

  return {
    appVersion,
    updateStatus,
    showUpdateModal,
    setShowUpdateModal,
    handleCheckUpdates,
    handleDownloadUpdate,
    handleInstallUpdate
  };
};
