/** Linux CI only: grant the gateway UID narrow access without changing other subjects' rights. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile), gatewayUser = "lexopen-kitties-ci";
const sourceCommit = "6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3";
const bits = text => [...text].reduce((value, char, index) => value | (char === "-" ? 0 : 4 >> index), 0);
const permissions = value => [4, 2, 1].map((bit, index) => value & bit ? "rwx"[index] : "-").join("");

export function narrowAclChange(text, uid, requested) {
  assert.match(uid, /^[1-9][0-9]*$/);
  assert.match(requested, /^[r-][w-][x-]$/);
  const entries = text.split("\n").filter(line => line && !line.startsWith("#") && !line.startsWith("default:"));
  const parsed = entries.map(line => {
    const match = /^(user|group|mask|other):([^:]*):([r-][w-][x-])(?:\s+#effective:.*)?$/.exec(line);
    assert.ok(match, "Unexpected ACL format"); return { kind: match[1], id: match[2], permissions: bits(match[3]) };
  });
  const mask = parsed.find(entry => entry.kind === "mask")?.permissions ?? parsed.find(entry => entry.kind === "group" && entry.id === "")?.permissions;
  assert.notEqual(mask, undefined, "Missing ACL group or mask");
  const own = (parsed.find(entry => entry.kind === "user" && entry.id === uid)?.permissions ?? 0) & mask;
  const nextOwn = own | bits(requested), nextMask = mask | nextOwn;
  for (const entry of parsed) {
    if (entry.kind === "group" || entry.kind === "user" && entry.id && entry.id !== uid) {
      assert.equal(entry.permissions & nextMask, entry.permissions & mask, "ACL change would widen another subject");
    }
  }
  return `u:${uid}:${permissions(nextOwn)},m::${permissions(nextMask)}`;
}

async function run(binary, args) {
  return execute(binary, args, { encoding: "utf8", timeout: 30_000, maxBuffer: 256 * 1024, env: { PATH: process.env.PATH, LANG: "C.UTF-8" } });
}
async function asGateway(flag, target) {
  try { await run("sudo", ["-n", "-u", gatewayUser, "env", "-i", "PATH=/usr/local/bin:/usr/bin:/bin", "/usr/bin/test", flag, target]); return true; }
  catch { return false; }
}
function ancestors(target) {
  const paths = []; for (let current = target; ; current = dirname(current)) { paths.unshift(current); if (dirname(current) === current) return paths; }
}
async function main() {
  assert.ok(process.platform === "linux" && process.env.CI === "true" && process.env.LEXOPEN_ALTAZOR_TEST_DOCKER === "1", "Explicit Linux CI opt-in required");
  const runnerTemp = await realpath(process.env.RUNNER_TEMP), source = await realpath(process.argv[2]);
  assert.ok(source.startsWith(runnerTemp + sep), "Pinned public source must remain in RUNNER_TEMP");
  assert.equal((await readFile(join(source, ".lexopen-source-commit"), "utf8")).trim(), sourceCommit);
  assert.equal(await lstat(join(source, ".git")).catch(() => null), null, "Archived public source must not contain Git metadata");
  const binary = await realpath(join(source, "dist/kitties"));
  assert.ok(binary.startsWith(source + sep) && (await lstat(binary)).isFile(), "Pinned binary must be a regular file within the archived source");
  const uid = (await run("id", ["-u", gatewayUser])).stdout.trim(); assert.match(uid, /^[1-9][0-9]*$/);
  const beforeHash = createHash("sha256").update(await readFile(binary)).digest("hex");
  const audit = await mkdtemp(join(runnerTemp, "lexopen-computer-ci-acls-"));
  await writeFile(join(audit, ".owned-computer-ci-acls"), "public-ci-runtime-acl-only\n", { mode: 0o600 });
  let grants = 0;
  async function grant(target, requested) {
    const before = (await run("getfacl", ["-c", "-p", "-n", "-E", target])).stdout;
    const change = narrowAclChange(before, uid, requested);
    const backup = (await run("getfacl", ["-p", "-n", target])).stdout;
    await writeFile(join(audit, `before-${grants}.acl`), backup, { mode: 0o600 });
    await run("sudo", ["-n", "setfacl", "-n", "-m", change, target]); grants++;
  }
  for (const target of ancestors(dirname(binary))) {
    assert.ok((await lstat(target)).isDirectory(), "Expected a resolved ancestor directory");
    if (!await asGateway("-x", target)) await grant(target, "--x");
    assert.ok(await asGateway("-x", target), "Gateway UID still cannot traverse a required ancestor");
  }
  if (!await asGateway("-r", binary) || !await asGateway("-x", binary)) await grant(binary, "r-x");
  assert.ok(await asGateway("-r", binary) && await asGateway("-x", binary) && await asGateway("-x", source), "Gateway UID executable/source preflight failed");
  assert.equal(createHash("sha256").update(await readFile(binary)).digest("hex"), beforeHash, "ACL preparation must not change the pinned binary");
  console.log(`Computer CI permission preflight PASS: dedicated UID, ${grants} narrow ACL grants, preserved other subjects and unchanged pinned binary.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => { console.error("Computer CI permission preflight FAILED: owned path, source pin, ACL preservation or dedicated UID access. No private paths or command output printed."); process.exitCode = 1; });
