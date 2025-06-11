// const trigger = 'production'
const trigger = 'development'
export function logWithTimestamp(...args: unknown[]) {
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').replace('Z', '');
  // eslint-disable-next-line no-console
  if(process.env.NODE_ENV === trigger ) {
    console.log(`[${ts}]`, ...(args as unknown[]));
  }
}

export function warnWithTimestamp(...args: unknown[]) {
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').replace('Z', '');
  // eslint-disable-next-line no-console
  if(process.env.NODE_ENV === trigger ) {
    console.warn(`[${ts}]`, ...(args as unknown[]));
  }
}

export function errorWithTimestamp(...args: unknown[]) {
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').replace('Z', '');
  // eslint-disable-next-line no-console
  if(process.env.NODE_ENV === trigger) {
    console.error(`[${ts}]`, ...(args as unknown[]));
  }
} 