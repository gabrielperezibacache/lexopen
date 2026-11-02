import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import { discardBookImportAttempt, putObject } from "../storage";

async function main() {
  const previous = { ...process.env }, root = await mkdtemp(path.join(os.tmpdir(), "lexopen-book-attempt-"));
  try {
    process.env.STORAGE_PATH = root; process.env.S3_BUCKET = ""; process.env.S3_ACCESS_KEY_ID = ""; process.env.S3_SECRET_ACCESS_KEY = "";
    const prefix = `library-books/book_${"a".repeat(40)}`, first = `${prefix}/attempts/${randomUUID()}/original/${"b".repeat(64)}`, second = `${prefix}/attempts/${randomUUID()}/text/${"c".repeat(64)}`;
    await putObject({ key: first, body: "original ficticio", contentType: "text/plain" }); await putObject({ key: second, body: "ganador ficticio", contentType: "text/plain" });
    await discardBookImportAttempt(first); await assert.rejects(readFile(path.join(root, first))); assert.equal(await readFile(path.join(root, second), "utf8"), "ganador ficticio");
    await discardBookImportAttempt(first);
    for (const key of [`${prefix}/original/${"b".repeat(64)}`, "../../outside", "evidence/document/original", `${prefix}/attempts/not-a-uuid/original/${"b".repeat(64)}`]) await assert.rejects(discardBookImportAttempt(key));
    assert.equal(await readFile(path.join(root, second), "utf8"), "ganador ficticio");
    const deleted: string[] = [];
    const server = createServer((req, res) => { if (req.method !== "DELETE") { res.statusCode = 405; res.end(); return; } deleted.push(decodeURIComponent(new URL(req.url!, "http://fixture.invalid").pathname)); res.statusCode = 204; res.end(); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      process.env.S3_BUCKET = "fixture-bucket"; process.env.S3_ACCESS_KEY_ID = "fixture-access"; process.env.S3_SECRET_ACCESS_KEY = "fixture-secret"; process.env.S3_REGION = "us-east-1"; process.env.S3_ENDPOINT = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      await discardBookImportAttempt(first); assert.deepEqual(deleted, [`/fixture-bucket/${first}`]);
      await assert.rejects(discardBookImportAttempt("evidence/historical-source")); assert.equal(deleted.length, 1);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
    console.log("Book import compensation PASS: isolated own-attempt removal, idempotent missing object, other attempt intact, shared/historical/unsafe paths refused, S3 SDK DELETE transport checked with loopback fixture only.");
  } finally { Object.assign(process.env, previous); for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; await rm(root, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
