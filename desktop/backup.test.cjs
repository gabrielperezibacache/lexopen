const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  BACKUP_LOCK_NAME,
  createDataBackup,
  createRotatingDataBackup,
  defaultBackupDirectory,
  finalizeRestore,
  listRotatingBackups,
  normalizeBackupRetention,
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

  const rotatingRoot = path.join(root, "rotating-backups");
  assert.equal(
    defaultBackupDirectory(source),
    path.join(root, "source-backups")
  );
  assert.equal(normalizeBackupRetention("2"), 2);
  await assert.rejects(
    () => createRotatingDataBackup(source, path.join(source, "backups")),
    /separado/
  );
  await assert.rejects(
    () => createRotatingDataBackup(source, rotatingRoot, { keep: 0 }),
    /entre 1 y/
  );

  for (let index = 0; index < 3; index += 1) {
    const result = await createRotatingDataBackup(source, rotatingRoot, {
      appVersion: "test",
      keep: 2,
      now: `2026-08-11T00:0${index}:00.000Z`,
    });
    assert.equal(result.manifest.backupMode, "automatic");
  }
  const rotatingBackups = await listRotatingBackups(rotatingRoot);
  assert.equal(rotatingBackups.length, 2);
  assert.equal(
    fs.existsSync(path.join(rotatingRoot, "lexopen-backup-20260811T000000-000Z")),
    false
  );

  const lock = path.join(rotatingRoot, BACKUP_LOCK_NAME);
  fs.mkdirSync(lock);
  fs.writeFileSync(
    path.join(lock, "owner.json"),
    JSON.stringify({ pid: process.pid, token: "test-lock" })
  );
  await assert.rejects(
    () =>
      createRotatingDataBackup(source, rotatingRoot, {
        keep: 2,
        now: "2026-08-11T00:03:00.000Z",
      }),
    /otro respaldo automático/
  );
  fs.rmSync(lock, { recursive: true, force: true });

  fs.rmSync(root, { recursive: true, force: true });
  console.log("desktop/backup.test.cjs OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
