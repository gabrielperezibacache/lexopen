import assert from "node:assert/strict";
import {
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
