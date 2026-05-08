import { NextResponse } from 'next/server';
import { getUserDataPath, getAppCachePath, getImageCachePath } from '@/utils/paths';
import path from 'path';

export async function GET() {
  const debugInfo = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      USER_DATA_PATH: process.env.USER_DATA_PATH,
      APP_CACHE_PATH: process.env.APP_CACHE_PATH,
    },
    process: {
      cwd: process.cwd(),
      execPath: process.execPath,
      execPathDir: path.dirname(process.execPath),
      platform: process.platform,
    },
    computedPaths: {
      getUserDataPath: getUserDataPath(),
      getAppCachePath: getAppCachePath(),
      getImageCachePath: getImageCachePath(),
    }
  };

  return NextResponse.json(debugInfo, { status: 200 });
}
