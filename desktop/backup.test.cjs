const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createDataBackup,
  finalizeRestore,
  restoreDataDirectory,
} = require("./backup.cjs");

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-backup-"));
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  const backup = path.join(root, "backup");

  fs.mkdirSync(path.join(source, "pgdata"), { recursive: true });
  fs.mkdirSync(path.join(source, "storage", "documents"), { recursive: true });
  fs.mkdirSync(path.join(source, "obsidian-vault"), { recursive: true });
  fs.writeFileSync(path.join(source, "pgdata", "PG_VERSION"), "17\n");
  fs.writeFileSync(path.join(source, "storage", "documents", "one.txt"), "uno");
  fs.writeFileSync(path.join(source, "desktop-config.json"), '{"mode":"host"}\n');
  fs.writeFileSync(path.join(source, ".env"), "SESSION_SECRET=secret\n");

  const manifest = await createDataBackup(source, backup, { appVersion: "test" });
  assert.equal(manifest.type, "lexopen-host-data");
  assert.equal(fs.existsSync(path.join(backup, "manifest.json")), true);
  assert.equal(
    fs.readFileSync(path.join(backup, "storage", "documents", "one.txt"), "utf8"),
    "uno"
  );

  fs.mkdirSync(path.join(target, "storage"), { recursive: true });
  fs.writeFileSync(path.join(target, "old.txt"), "old");
  const replacement = await restoreDataDirectory(target, backup);
  assert.equal(fs.existsSync(path.join(target, "old.txt")), false);
  assert.equal(
    fs.readFileSync(path.join(target, "storage", "documents", "one.txt"), "utf8"),
    "uno"
  );
  assert.equal(fs.existsSync(path.join(target, "manifest.json")), false);
  assert.equal(fs.existsSync(path.join(replacement.rollback, "old.txt")), true);

  await finalizeRestore(replacement.rollback);
  assert.equal(fs.existsSync(replacement.rollback), false);
  fs.rmSync(root, { recursive: true, force: true });
  console.log("desktop/backup.test.cjs OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
