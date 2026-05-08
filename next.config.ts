import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
  output: "standalone",
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
