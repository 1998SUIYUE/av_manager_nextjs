const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");

function getUserDataPath() {
  return process.env.USER_DATA_PATH
    ? path.resolve(process.env.USER_DATA_PATH)
    : path.join(process.cwd(), "userData");
}

function isValidLocalCover(coverUrl) {
  return typeof coverUrl === "string" && coverUrl.startsWith("/api/image-serve/");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const databasePath = path.join(getUserDataPath(), "app-data.sqlite");

  if (!fs.existsSync(databasePath)) {
    throw new Error(`Database not found: ${databasePath}`);
  }

  const db = new DatabaseSync(databasePath);
  const dirtyRows = db.prepare(
    `SELECT code, cover_url FROM movie_metadata
     WHERE cover_url IS NULL OR cover_url NOT LIKE '/api/image-serve/%'`
  ).all();

  console.log(`Database: ${databasePath}`);
  console.log(`Invalid metadata rows: ${dirtyRows.length}`);
  for (const row of dirtyRows) {
    console.log(`- ${row.code}: ${row.cover_url ?? "<null>"}`);
  }

  if (!apply) {
    console.log("Dry-run complete. Use --apply to delete these rows.");
    return;
  }

  const backupPath = path.join(
    getUserDataPath(),
    `app-data.sqlite.backup-before-prune-${Date.now()}`
  );
  db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  console.log(`Backup created: ${backupPath}`);

  db.exec("BEGIN");
  try {
    const result = db.prepare(
      `DELETE FROM movie_metadata
       WHERE cover_url IS NULL OR cover_url NOT LIKE '/api/image-serve/%'`
    ).run();
    db.exec("COMMIT");
    console.log(`Deleted rows: ${result.changes}`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
