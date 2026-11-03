// electron-builder afterPack：extraResources 默认排除 node_modules，
// 这里手动把实体化的 standalone node_modules 补进 resources/app
const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(context) {
  const projectDir = process.cwd();
  const src = path.join(projectDir, ".next", "standalone-packaged", "node_modules");
  const dest = path.join(context.appOutDir, "resources", "app", "node_modules");

  if (!fs.existsSync(src)) {
    throw new Error(`afterPack：缺少 ${src}，请先执行 npm run pack:standalone`);
  }

  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });

  const marker = path.join(dest, "next", "dist", "server", "next.js");
  if (!fs.existsSync(marker)) {
    throw new Error("afterPack：node_modules 拷贝后校验失败");
  }
  console.log(`  • afterPack: node_modules 已补入 ${dest}`);
};
