import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hardenReadFiles, rewriteReadFiles } from "./harden-read-files.mjs";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const reads = rewriteReadFiles("internal/connector/reads.go", 'return githubReads()\nreturn merged(googleReads(), googlePersonal())\nfunc readActions(kind string) []Action {');
assert.match(reads, /lexopenReadFiles\("github"\)/);
assert.match(reads, /lexopenLegacyReadActions/);
const catalog = rewriteReadFiles("internal/connector/catalog.go", 'return "saved as " + req.file, req.file, raw, nil\nif r.url == dropboxContent + "/files/download" && resp.StatusCode >= 200 && resp.StatusCode < 300 {');
assert.match(catalog, /lexopenFileReceipt/);
assert.match(catalog, /r.file != ""/);
assert.match(rewriteReadFiles("internal/gateway/gateway.go", 'out["lexopen_async_messages"] = chat.AsyncMessagesVersion'), /lexopen_file_reads/);
assert.throws(() => rewriteReadFiles("internal/connector/catalog.go", "different"), /no longer matches/);
const root = await mkdtemp(join(tmpdir(), "lexopen-file-reads-test-"));
try {
  for (const [name, value] of Object.entries({ ".lexopen-source-commit": PINNED_COMMIT, ".lexopen-connector-gate":"v1", ".lexopen-async-messages":"v1" })) await writeFile(join(root, name), value);
  await mkdir(join(root, "internal/connector"), { recursive:true });
  await writeFile(join(root, "internal/connector/reads.go"), "modified");
  await assert.rejects(() => hardenReadFiles(root), /Pinned file-reading source differs/);
  assert.equal(await readFile(join(root, "internal/connector/reads.go"), "utf8"), "modified");
  await writeFile(join(root, ".lexopen-source-commit"), "wrong");
  await assert.rejects(() => hardenReadFiles(root), /exact connector and async/);
} finally { await rm(root, { recursive:true, force:true }); }
console.log("Pinned file reads: exact source, bounded complete downloads and capability advertisement PASS.");
