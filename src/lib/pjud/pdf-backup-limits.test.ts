import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import {
  backupMovimientoDocuments,
  inferPjudDownloadedFileMeta,
  pdfBackupEnabled,
  pjudDocDownloadDelayMs,
  pjudDocDownloadMaxPerRun,
  validPjudDownloadedContent,
  isBackupableDocumentoRef,
} from "@/lib/pjud/pdf-backup";

const prevDelay = process.env.PJUD_DOC_DOWNLOAD_DELAY_MS;
const prevMax = process.env.PJUD_DOC_DOWNLOAD_MAX;

delete process.env.PJUD_DOC_DOWNLOAD_DELAY_MS;
delete process.env.PJUD_DOC_DOWNLOAD_MAX;
assert.equal(pjudDocDownloadDelayMs(), 2500);
assert.equal(pjudDocDownloadMaxPerRun(), 20);

const pdfBytes = Buffer.from("%PDF-1.7\n" + "x".repeat(120));
const oleBytes = Buffer.concat([Buffer.from("d0cf11e0", "hex"), Buffer.alloc(120)]);
const docxBytes = Buffer.concat([Buffer.from("504b0304", "hex"), Buffer.alloc(120)]);
const rtfBytes = Buffer.from("{\\rtf1" + "x".repeat(120));
assert.equal(validPjudDownloadedContent(pdfBytes, "application/pdf", "https://oficinajudicialvirtual.pjud.cl/a.pdf", 1024), true);
assert.equal(validPjudDownloadedContent(oleBytes, "application/octet-stream", "https://oficinajudicialvirtual.pjud.cl/a.doc", 1024), true);
assert.equal(validPjudDownloadedContent(docxBytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "https://oficinajudicialvirtual.pjud.cl/a", 1024), true);
assert.equal(validPjudDownloadedContent(rtfBytes, "application/rtf", "https://oficinajudicialvirtual.pjud.cl/a", 1024), true);
assert.equal(validPjudDownloadedContent(rtfBytes, "text/plain", "https://oficinajudicialvirtual.pjud.cl/doc.php", 1024), true, "an RTF signature is recognized even on a generic .php endpoint");
assert.deepEqual(inferPjudDownloadedFileMeta(pdfBytes, "application/pdf", "https://oficinajudicialvirtual.pjud.cl/docuS.php?jwt=fixture", "pjud-1"), { filename: "pjud-1.pdf", mimeType: "application/pdf" });
assert.deepEqual(inferPjudDownloadedFileMeta(oleBytes, "application/msword", "https://oficinajudicialvirtual.pjud.cl/docCausaSuprema.php", "pjud-4"), { filename: "pjud-4.doc", mimeType: "application/msword" });
assert.deepEqual(inferPjudDownloadedFileMeta(oleBytes, "application/octet-stream", "https://oficinajudicialvirtual.pjud.cl/docuS.php", "pjud-8"), { filename: "pjud-8.doc", mimeType: "application/msword" });
assert.deepEqual(inferPjudDownloadedFileMeta(docxBytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "https://oficinajudicialvirtual.pjud.cl/anexoDocCivil.php", "pjud-5"), { filename: "pjud-5.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
assert.deepEqual(inferPjudDownloadedFileMeta(rtfBytes, "application/rtf", "https://oficinajudicialvirtual.pjud.cl/docuCobranza.php", "pjud-6"), { filename: "pjud-6.rtf", mimeType: "application/rtf" });
assert.deepEqual(inferPjudDownloadedFileMeta(docxBytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "https://oficinajudicialvirtual.pjud.cl/original.docx", "pjud-7"), { filename: "original.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
assert.equal(validPjudDownloadedContent(Buffer.from("not a Word document".padEnd(140, "x")), "application/msword", "https://oficinajudicialvirtual.pjud.cl/a.doc", 1024), false);
assert.equal(isBackupableDocumentoRef(`https://oficinajudicialvirtual.pjud.cl/doc.php?jwt=${"x".repeat(700)}`), true, "fresh signed links may exceed 500 characters");
assert.equal(isBackupableDocumentoRef("https://oficinajudicialvirtual.pjud.cl/#modalEscritoSuprema"), false);
assert.equal(isBackupableDocumentoRef("https://oficinajudicialvirtual.pjud.cl/doc.php#fragment"), false);
assert.equal(isBackupableDocumentoRef(`https://oficinajudicialvirtual.pjud.cl/doc.php?jwt=${"x".repeat(4001)}`), false);

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
