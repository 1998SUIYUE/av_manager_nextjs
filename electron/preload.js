// 渲染进程桥：仅暴露最小能力面
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  selectFolder: async () => {
    const result = await ipcRenderer.invoke("dialog:select-folder");
    return result && !result.canceled ? result.path : null;
  },
});
