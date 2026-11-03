import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
  output: "standalone",
  // dev 与 build 分离：dev 清理 .next-dev，避免误删 .next 内的 standalone 打包产物
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  onDemandEntries:
    process.env.NODE_ENV === "development"
      ? {
          maxInactiveAge: 25 * 1000,
          pagesBufferLength: 2,
        }
      : undefined,
};

export default nextConfig;
