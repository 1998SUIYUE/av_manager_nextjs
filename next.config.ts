import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: false
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/image-cache/:path*',
        destination: '/image-cache/:path*',
      },
    ];
  },
};

export default nextConfig;