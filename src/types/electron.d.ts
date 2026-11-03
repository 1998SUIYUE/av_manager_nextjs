export {};

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      /** 打开系统原生文件夹选择对话框，返回所选绝对路径；取消返回 null */
      selectFolder: () => Promise<string | null>;
    };
  }
}
