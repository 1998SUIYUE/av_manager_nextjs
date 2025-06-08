export function logWithTimestamp(...args: unknown[]) {
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').replace('Z', '');
  // eslint-disable-next-line no-console
  console.log(`[${ts}]`, ...(args as unknown[]));
}

export function warnWithTimestamp(...args: unknown[]) {
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').replace('Z', '');
  // eslint-disable-next-line no-console
  console.warn(`[${ts}]`, ...(args as unknown[]));
}

export function errorWithTimestamp(...args: unknown[]) {
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').replace('Z', '');
  // eslint-disable-next-line no-console
  console.error(`[${ts}]`, ...(args as unknown[]));
} 