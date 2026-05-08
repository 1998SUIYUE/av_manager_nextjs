const fs = require("fs/promises");
const path = require("path");

function getUserDataPath() {
  if (process.env.USER_DATA_PATH) {
    return path.resolve(process.env.USER_DATA_PATH);
  }
  return path.join(process.cwd(), "userData");
}

function isRemoteCoverUrl(coverUrl) {
  return typeof coverUrl === "string" && /^https:\/\//i.test(coverUrl);
}

async function main() {
  const userDataPath = getUserDataPath();
  const cachePath = path.join(userDataPath, "movie-metadata-cache.json");

  const raw = await fs.readFile(cachePath, "utf8");
  const data = JSON.parse(raw);

  if (!Array.isArray(data)) {
    throw new Error("movie-metadata-cache.json is not an array");
  }

  const removed = data.filter((item) => isRemoteCoverUrl(item && item.coverUrl));
  const kept = data.filter((item) => !isRemoteCoverUrl(item && item.coverUrl));

  const backupPath = `${cachePath}.bak-${Date.now()}`;
  await fs.copyFile(cachePath, backupPath);
  await fs.writeFile(cachePath, JSON.stringify(kept, null, 2), "utf8");

  console.log(`Removed ${removed.length} entries with https coverUrl.`);
  console.log(`Backup written to: ${backupPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
