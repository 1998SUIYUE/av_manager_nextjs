const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 文件系统操作
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  
  // 进度更新（仅用于启动画面）
  onProgressUpdate: (callback) => {
    ipcRenderer.on('update-progress', callback);
  }
});