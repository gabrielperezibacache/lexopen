import assert from "node:assert/strict";
import { createLocalBackupScheduler } from "./web-backup-scheduler.mjs";

const events = [];
let child = { pid: 1 };
let backupArguments = null;
const logger = {
  log(message) {
    events.push(message);
  },
  warn(message) {
    events.push(`WARN:${message}`);
  },
};

const scheduler = createLocalBackupScheduler({
  dataDir: "/tmp/lexopen-data",
  env: {
    LEXOPEN_BACKUP_INTERVAL_MINUTES: "60",
    LEXOPEN_BACKUP_DIR: "/tmp/lexopen-backups",
    LEXOPEN_BACKUP_KEEP: "3",
  },
  baseUrl: "http://127.0.0.1:3000",
  getChild: () => child,
  stopHost: async () => {
    events.push("stop");
    child = null;
  },
  startHost: () => {
    events.push("start");
    child = { pid: 2 };
  },
  waitForHost: async () => true,
  backup: async (...args) => {
    backupArguments = args;
    events.push("backup");
    return {
      destination: "/tmp/lexopen-backups/lexopen-backup-test",
      removed: ["old"],
    };
  },
  logger,
});

assert.ok(scheduler);
await scheduler.runNow();
assert.deepEqual(
  events.filter((event) => ["stop", "backup", "start"].includes(event)),
  ["stop", "backup", "start"]
);
assert.equal(backupArguments[0], "/tmp/lexopen-data");
assert.equal(backupArguments[1], "/tmp/lexopen-backups");
assert.equal(backupArguments[2].keep, 3);
await scheduler.stop();

assert.equal(
  createLocalBackupScheduler({
    dataDir: "/tmp/lexopen-data",
    env: {
      LEXOPEN_BACKUP_INTERVAL_MINUTES: "60",
      LEXOPEN_BACKUP_KEEP: "0",
    },
    getChild: () => null,
    stopHost: async () => {},
    startHost: () => {},
    waitForHost: async () => true,
    logger,
  }),
  null
);
assert.equal(
  createLocalBackupScheduler({
    dataDir: "/tmp/lexopen-data",
    env: {},
    getChild: () => null,
    stopHost: async () => {},
    startHost: () => {},
    waitForHost: async () => true,
    logger,
  }),
  null
);

console.log("scripts/web-backup-scheduler.test.mjs OK");
