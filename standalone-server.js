// 独立的Next.js服务器启动脚本
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== 'production';

console.log('[standalone-server] 启动参数:');
console.log('[standalone-server] PORT:', port);
console.log('[standalone-server] NODE_ENV:', process.env.NODE_ENV);
console.log('[standalone-server] USER_DATA_PATH:', process.env.USER_DATA_PATH);
console.log('[standalone-server] APP_CACHE_PATH:', process.env.APP_CACHE_PATH);

const app = next({ 
  dev,
  dir: __dirname,
  conf: {
    // 确保使用正确的配置
    output: 'standalone',
    images: {
      unoptimized: true
    }
  }
});

const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`[standalone-server] 服务器运行在 http://localhost:${port}`);
  });
}).catch((ex) => {
  console.error('[standalone-server] 启动失败:', ex.stack);
  process.exit(1);
});