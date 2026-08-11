import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MAX_STORAGE_OBJECT_BYTES,
  getObject,
  putObject,
  storageMode,
} from "@/lib/storage";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "lexopen-storage-"));
process.env.STORAGE_PATH = root;
delete process.env.S3_BUCKET;
delete process.env.S3_ACCESS_KEY_ID;
delete process.env.S3_SECRET_ACCESS_KEY;

assert.equal(storageMode(), "local");

await putObject({ key: "documents/example.txt", body: "contenido" });
assert.equal(
  (await getObject("documents/example.txt"))?.toString("utf8"),
  "contenido"
);

await assert.rejects(
  putObject({ key: "../outside.txt", body: "no debe escribirse" }),
  (error: unknown) =>
    error instanceof Error &&
    "status" in error &&
    (error as { status: number }).status === 400
);
assert.equal(await getObject("../outside.txt"), null);

await assert.rejects(
  putObject({
    key: "documents/too-large.bin",
    body: Buffer.alloc(MAX_STORAGE_OBJECT_BYTES + 1),
  }),
  (error: unknown) =>
    error instanceof Error &&
    "status" in error &&
    (error as { status: number }).status === 413
);

await fs.rm(root, { recursive: true, force: true });
console.log("storage.test.ts OK");
