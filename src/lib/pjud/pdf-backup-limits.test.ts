import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import {
  backupMovimientoDocuments,
  pdfBackupEnabled,
  pjudDocDownloadDelayMs,
  pjudDocDownloadMaxPerRun,
} from "@/lib/pjud/pdf-backup";

const prevDelay = process.env.PJUD_DOC_DOWNLOAD_DELAY_MS;
const prevMax = process.env.PJUD_DOC_DOWNLOAD_MAX;

delete process.env.PJUD_DOC_DOWNLOAD_DELAY_MS;
delete process.env.PJUD_DOC_DOWNLOAD_MAX;
assert.equal(pjudDocDownloadDelayMs(), 2500);
assert.equal(pjudDocDownloadMaxPerRun(), 20);

process.env.PJUD_DOC_DOWNLOAD_DELAY_MS = "4000";
process.env.PJUD_DOC_DOWNLOAD_MAX = "8";
assert.equal(pjudDocDownloadDelayMs(), 4000);
assert.equal(pjudDocDownloadMaxPerRun(), 8);

process.env.PJUD_DOC_DOWNLOAD_DELAY_MS = "999999";
process.env.PJUD_DOC_DOWNLOAD_MAX = "999";
assert.equal(pjudDocDownloadDelayMs(), 30_000);
assert.equal(pjudDocDownloadMaxPerRun(), 50);

process.env.PJUD_DOC_DOWNLOAD_DELAY_MS = "-1";
process.env.PJUD_DOC_DOWNLOAD_MAX = "0";
assert.equal(pjudDocDownloadDelayMs(), 2500);
assert.equal(pjudDocDownloadMaxPerRun(), 20);

if (prevDelay === undefined) delete process.env.PJUD_DOC_DOWNLOAD_DELAY_MS;
else process.env.PJUD_DOC_DOWNLOAD_DELAY_MS = prevDelay;
if (prevMax === undefined) delete process.env.PJUD_DOC_DOWNLOAD_MAX;
else process.env.PJUD_DOC_DOWNLOAD_MAX = prevMax;

console.log("pjud doc download limits ok");

async function checkDownloadPolicy() {
  const names = ["PJUD_DOC_DOWNLOADS", "PJUD_PDF_BACKUP", "PJUD_PUBLIC_SCRAPE"] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const findMany = prisma.causaMovimiento.findMany;
  const fetch = globalThis.fetch;
  let databaseCalls = 0;
  let networkCalls = 0;
  try {
    delete process.env.PJUD_DOC_DOWNLOADS;
    delete process.env.PJUD_PDF_BACKUP;
    delete process.env.PJUD_PUBLIC_SCRAPE;
    assert.equal(pdfBackupEnabled(), false);
    process.env.PJUD_PUBLIC_SCRAPE = "1";
    assert.equal(pdfBackupEnabled(), true, "ordinary scrape backup default must remain enabled");
    process.env.PJUD_PDF_BACKUP = "0";
    assert.equal(pdfBackupEnabled(), false);
    process.env.PJUD_PDF_BACKUP = "1";
    assert.equal(pdfBackupEnabled(), true);

    prisma.causaMovimiento.findMany = (async () => {
      databaseCalls += 1;
      throw new Error("Disabled downloads must not query pending documents");
    }) as typeof findMany;
    globalThis.fetch = async () => {
      networkCalls += 1;
      throw new Error("Network is forbidden in the policy fixture");
    };
    process.env.PJUD_DOC_DOWNLOADS = "0";
    assert.equal(pdfBackupEnabled(), false, "download kill switch must override explicit backup opt-in");
    const disabled = { enabled: false, saved: 0, skipped: 0, attempted: 0 };
    assert.deepEqual(await backupMovimientoDocuments("synthetic-cause"), disabled);
    assert.deepEqual(await backupMovimientoDocuments("synthetic-cause", { force: true }), disabled,
      "manual forced backups must also honor the download kill switch");
    assert.equal(databaseCalls, 0);
    assert.equal(networkCalls, 0);
  } finally {
    prisma.causaMovimiento.findMany = findMany;
    globalThis.fetch = fetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
  console.log("pjud document download kill switch and unchanged backup defaults ok (zero network/database)");
}

checkDownloadPolicy().catch(error => { console.error(error); process.exitCode = 1; });
