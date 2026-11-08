import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hardenCloudFileConnectors, rewriteCloudFileConnectors } from "./harden-cloud-file-connectors.mjs";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const reads = '\tcase "microsoft-365":\n\t\treturn merged(microsoftReads(), microsoftPersonal())';
assert.match(rewriteCloudFileConnectors("internal/connector/reads.go", reads), /lexopenCloudReadFiles\(kind\)/);
assert.match(rewriteCloudFileConnectors("internal/chat/lexopen_native_connector_schema.go", "func(s *Service)lexopenNativeConnectorTool(name string)(provider.Tool,bool){"), /lexopenCloudConnectorTool/);
assert.match(rewriteCloudFileConnectors("internal/connector/lexopen_easy_file_validation.go", "func LexOpenValidateEasyFileCall(kind string,args map[string]any)error{"), /LexOpenValidateCloudFileCall/);
assert.throws(() => rewriteCloudFileConnectors("internal/connector/reads.go", reads + reads), /no longer matches/);
assert.throws(() => rewriteCloudFileConnectors("internal/chat/unrelated.go", "source"), /Not a pinned/);
const root = await mkdtemp(join(tmpdir(), "lexopen-cloud-hardener-test-"));
try {
  await writeFile(join(root, ".lexopen-source-commit"), PINNED_COMMIT);
  await writeFile(join(root, ".lexopen-staged-file-actions"), "v1\n");
  await mkdir(join(root, "internal/connector"), { recursive: true });
  const first = join(root, "internal/connector/reads.go");
  await writeFile(first, reads);
  await assert.rejects(() => hardenCloudFileConnectors(root), /Pinned cloud file source differs/);
  assert.equal(await readFile(first, "utf8"), reads, "source drift cannot partially edit the tree");
  await assert.rejects(() => lstat(join(root, ".lexopen-cloud-file-oauth")), { code: "ENOENT" });
  await writeFile(join(root, ".lexopen-source-commit"), "another-revision");
  await assert.rejects(() => hardenCloudFileConnectors(root), /exact Go9/);
} finally { await rm(root, { recursive: true, force: true }); }
console.log("Cloud file hardener PASS: exact Go9 prerequisite, pinned hashes, no partial drift edit, typed schemas and read gates.");
