import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MAX_STORAGE_OBJECT_BYTES,
  getObject,
  persistentStorageReady,
  putObject,
  storageMode,
} from "@/lib/storage";

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lexopen-storage-"));
  process.env.STORAGE_PATH = root;
  delete process.env.S3_BUCKET;
  delete process.env.S3_ACCESS_KEY_ID;
  delete process.env.S3_SECRET_ACCESS_KEY;

  assert.equal(storageMode(), "local");
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  const previousLocalProduction = env.LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE;
  env.NODE_ENV = "production";
  env.LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE = "1";
  assert.equal(persistentStorageReady(), true);
  env.LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE = "0";
  assert.equal(persistentStorageReady(), false);
  if (previousNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = previousNodeEnv;
  if (previousLocalProduction === undefined) {
    delete env.LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE;
  } else {
    env.LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE = previousLocalProduction;
  }

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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
