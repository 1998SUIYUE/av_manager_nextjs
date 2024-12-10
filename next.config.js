/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // domains: [
    //   'fivetiu.com',
    // ],
    // remotePatterns: [
    //   {
    //     protocol: 'https',
    //     hostname: 'assets-cdn.jable.tv',
    //     port: '',
    //     pathname: '/contents/videos_screenshots/**'
    //   }
    // ],
    unoptimized: false  // 保持图片优化
  },
  // 增加超时配置
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  }
};

module.exports = nextConfig;
