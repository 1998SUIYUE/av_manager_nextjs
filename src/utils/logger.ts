// 检查是否为开发环境
const isDev = process.env.NODE_ENV === 'development';

// 1. 开发环境专用日志 - 只在 dev 环境下打印
export function devWithTimestamp(...args: unknown[]) {
  if (isDev) {
    const now = new Date();
    const ts = now.toISOString().replace('T', ' ').replace('Z', '');
    // eslint-disable-next-line no-console
    console.log(`[DEV ${ts}]`, ...(args as unknown[]));
  }
}

// 2. 生产环境专用日志 - 只在 build 环境下打印
export function prodWithTimestamp(...args: unknown[]) {
  if (!isDev) {
    const now = new Date();
    const ts = now.toISOString().replace('T', ' ').replace('Z', '');
    // eslint-disable-next-line no-console
    console.log(`[PROD ${ts}]`, ...(args as unknown[]));
  }
}

// 3. 通用日志 - 在生产和开发环境都打印
export function allEnvWithTimestamp(...args: unknown[]) {
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').replace('Z', '');
  const env = isDev ? 'DEV' : 'PROD';
  // eslint-disable-next-line no-console
  console.log(`[${env} ${ts}]`, ...(args as unknown[]));
}