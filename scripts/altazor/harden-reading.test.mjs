/** Offline stage checks; actual Go compilation runs against the complete pinned recipe. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hardenReading, rewriteReading } from "./harden-reading.mjs";

test("semantic reading extends the existing computer-use classifier without removing its gate", async () => {
  const policy = await readFile(new URL("./patches/computer-use-desktop.go", import.meta.url), "utf8");
  const adapted = rewriteReading("internal/desktop/lexopen_computer_use.go", policy);
  assert.match(adapted, /case "page_read":[\s\S]*LexopenReadArgv\("browser",a.Args\)/);
  assert.match(adapted, /case "document_read":[\s\S]*LocalRead:true,Automatic:p.Mode=="intelligent"\|\|p.Mode=="autonomous"/);
  assert.match(adapted, /computerInteger\(a.Args\["ref"\], 1, 2000\)/);
  assert.match(adapted, /if a.Name=="document_read"/);
  assert.match(adapted, /computerLocalRead\(a\)/);
  assert.match(adapted, /computerVerifiedReader/);
  assert.match(adapted, /Follows|ReadComputerLocal|local read could not be verified/);
});

test("the last recipe stage rejects missing predecessors, reapplication and changed source before writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "lexopen-reading-stage-test-"));
  try {
    await writeFile(join(root, ".lexopen-source-commit"), "6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3\n");
    await assert.rejects(hardenReading(root));
    await writeFile(join(root, ".lexopen-drive-management"), "v1\n");
    await writeFile(join(root, ".lexopen-semantic-reading"), "v1\n");
    await assert.rejects(hardenReading(root), /already applied/);
    await rm(join(root, ".lexopen-semantic-reading"));
    await mkdir(join(root, "internal", "gateway"), { recursive: true });
    const file = join(root, "internal", "gateway", "gateway.go");
    await writeFile(file, "changed pinned input\n");
    await assert.rejects(hardenReading(root), /post-recipe.*hash changed/);
    assert.equal(await readFile(file, "utf8"), "changed pinned input\n");
    await assert.rejects(readFile(join(root, ".lexopen-semantic-reading")));
  } finally { await rm(root, { recursive: true, force: true }); }
});
