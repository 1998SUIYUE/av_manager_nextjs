import type { NextConfig } from "next";
import path from "path";

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  images: {
    unoptimized: true
  },
  
  output: 'standalone',
  
  // 修复 Electron 环境下的静态资源路径
  assetPrefix: isDev ? '' : '',
  basePath: '',
  
  // 关闭请求日志
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  
  // 在开发环境中减少日志输出
  ...(isDev && {
    onDemandEntries: {
      maxInactiveAge: 25 * 1000,
      pagesBufferLength: 2,
    },
  }),
  
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
        path: false,
        os: false
      };
    }
    
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'electron': 'commonjs electron'
      });
    }
    
    return config;
  },
  
  env: {
    IS_ELECTRON: 'true',
    USER_DATA_PATH: process.env.USER_DATA_PATH || path.join(process.cwd(), 'userData'),
    APP_CACHE_PATH: process.env.APP_CACHE_PATH || path.join(process.cwd(), 'cache')
  }
};

export default nextConfig;