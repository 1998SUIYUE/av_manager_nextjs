// 将静态资源拷入 standalone 产物（Next standalone 不自带 .next/static 与 public）
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("未找到 .next/standalone/server.js，请先执行 npm run build");
  process.exit(1);
}

fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
console.log("standalone 已就绪：.next/static 与 public 已拷入");
