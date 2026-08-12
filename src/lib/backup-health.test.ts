import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getLocalBackupHealth } from "@/lib/backup-health";

async function main() {
  const disabled = await getLocalBackupHealth({
    LEXOPEN_BACKUP_INTERVAL_MINUTES: "0",
    LEXOPEN_DATA_DIR: "/tmp/lexopen-health-data",
  });
  assert.equal(disabled.status, "disabled");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-backup-health-"));
  const enabledEnv = {
    LEXOPEN_BACKUP_INTERVAL_MINUTES: "60",
    LEXOPEN_BACKUP_KEEP: "3",
    LEXOPEN_BACKUP_DIR: root,
  };

  const missing = await getLocalBackupHealth(enabledEnv);
  assert.equal(missing.directoryState, "ready");
  assert.equal(missing.status, "missing");

  const backupName = "lexopen-backup-20260812T043000-000Z";
  fs.mkdirSync(path.join(root, backupName));
  fs.writeFileSync(
    path.join(root, backupName, "manifest.json"),
    JSON.stringify({
      formatVersion: 1,
      type: "lexopen-host-data",
      createdAt: new Date().toISOString(),
    })
  );
  const healthy = await getLocalBackupHealth(enabledEnv);
  assert.equal(healthy.status, "healthy");
  assert.equal(healthy.lastBackup?.name, backupName);

  fs.writeFileSync(
    path.join(root, backupName, "manifest.json"),
    JSON.stringify({
      formatVersion: 1,
      type: "lexopen-host-data",
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    })
  );
  const stale = await getLocalBackupHealth(enabledEnv);
  assert.equal(stale.status, "stale");

  fs.rmSync(root, { recursive: true, force: true });
  console.log("backup-health.test.ts OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
