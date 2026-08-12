import assert from "node:assert/strict";
import path from "path";
import os from "os";
import fs from "fs";
import {
  assertAllowedVaultPath,
  defaultObsidianVaultRoot,
  resolveUnderVault,
  sanitizeVaultFolderPrefix,
} from "@/lib/integrations/obsidian-path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-vault-"));
const prevVault = process.env.OBSIDIAN_VAULT_PATH;
const prevData = process.env.LEXOPEN_DATA_DIR;
process.env.OBSIDIAN_VAULT_PATH = tmp;
delete process.env.LEXOPEN_DATA_DIR;

assert.equal(defaultObsidianVaultRoot(), path.resolve(tmp));
assert.equal(assertAllowedVaultPath(tmp), path.resolve(tmp));
assert.equal(
  assertAllowedVaultPath(path.join(tmp, "nested")),
  path.resolve(tmp, "nested")
);
assert.throws(() => assertAllowedVaultPath("/etc/passwd"), /bajo/);
assert.equal(sanitizeVaultFolderPrefix("LexOpen/Causas"), "LexOpen/Causas");
assert.throws(() => sanitizeVaultFolderPrefix("../escape"), /inválida/);
assert.equal(
  resolveUnderVault(tmp, "LexOpen", "Causas", "Index.md"),
  path.resolve(tmp, "LexOpen", "Causas", "Index.md")
);
assert.throws(() => resolveUnderVault(tmp, "..", "etc"), /inválida|fuera/);

if (prevVault === undefined) delete process.env.OBSIDIAN_VAULT_PATH;
else process.env.OBSIDIAN_VAULT_PATH = prevVault;
if (prevData === undefined) delete process.env.LEXOPEN_DATA_DIR;
else process.env.LEXOPEN_DATA_DIR = prevData;
fs.rmSync(tmp, { recursive: true, force: true });

console.log("integrations/obsidian-path.test.ts OK");
