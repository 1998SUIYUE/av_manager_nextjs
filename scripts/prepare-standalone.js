// 生成打包用 standalone 目录：
// 1. 拷入 .next/static 与 public（Next standalone 不自带）
// 2. 产出 .next/standalone-packaged —— node_modules 在 Windows 上是 junction，
//    electron-builder 原样拷贝会得到断链（装到其他盘后 require 全挂），
//    这里用 dereference 把所有链接实体化成真实文件
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const packaged = path.join(root, ".next", "standalone-packaged");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("未找到 .next/standalone/server.js，请先执行 npm run build");
  process.exit(1);
}

fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });

fs.rmSync(packaged, { recursive: true, force: true });
fs.cpSync(standalone, packaged, { recursive: true, dereference: true });

const nextPkg = path.join(packaged, "node_modules", "next", "package.json");
if (!fs.existsSync(nextPkg)) {
  console.error("实体化失败：node_modules/next 不在打包目录中");
  process.exit(1);
}
console.log("standalone-packaged 已就绪（node_modules 已实体化）");
