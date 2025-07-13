// 类型声明文件
declare module 'find-free-port' {
  function findFreePort(startPort: number, endPort: number): Promise<number | number[]>;
  export = findFreePort;
}

declare module 'electron-is-dev' {
  const isDev: boolean;
  export = isDev;
}