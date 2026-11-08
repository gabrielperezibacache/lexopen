/** Offline orchestration checks: no Go compilation, provider or runtime. */
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { PINNED_COMMIT } from "./harden-connectors.mjs";
import { GATEWAY_HARDENING_STAGES, prepareGatewaySource } from "./prepare-gateway-source.mjs";

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "lexopen-gateway-recipe-test-"));
  try { await writeFile(join(root, ".lexopen-source-commit"), PINNED_COMMIT + "\n"); await run(await realpath(root)); }
  finally { await rm(root, { recursive: true, force: true }); }
}
test("the recipe preflights all scripts, tests before mutation and preserves pinned formatting boundaries", async () => fixture(async root => {
  const calls = [];
  const result = await prepareGatewaySource(root, { gofmt: "/synthetic/gofmt", execute: async (binary, args, options) => { calls.push({ binary, args, cwd: options.cwd }); assert.equal(options.shell, false); } });
  const tests = calls.filter(call => call.args[0].endsWith(".test.mjs"));
  const changes = calls.filter(call => call.args[0].endsWith(".mjs") && !call.args[0].endsWith(".test.mjs"));
  assert.equal(tests.length, 15); assert.equal(changes.length, 15); assert.equal(calls.length, 36);
  assert.ok(calls.slice(0, 15).every(call => call.args[0].endsWith(".test.mjs")));
  assert.deepEqual(changes.map(call => basename(call.args[0])), ["harden-connectors.mjs", "harden-async-messages.mjs", "harden-read-files.mjs", "harden-vision-context.mjs", "harden-native-connector-schema.mjs", "harden-connector-file-focus.mjs", "harden-native-file-actions.mjs", "harden-readable-file-results.mjs", "harden-compact-file-results.mjs", "harden-persistent-oauth.mjs", "harden-staged-file-actions.mjs", "harden-cloud-file-connectors.mjs", "harden-computer-use-policy.mjs", "harden-oauth-alias-create.mjs", "harden-connected-file-focus.mjs"]);
  const formats = calls.filter(call => call.binary === "/synthetic/gofmt");
  assert.deepEqual(formats.map(call => call.args.length - 1), [5, 14, 7, 14, 4, 8]);
  for (const format of formats) { assert.equal(format.cwd, root); assert.equal(format.args[0], "-w"); assert.ok(format.args.slice(1).every(file => file.startsWith("internal/") && file.endsWith(".go") && !file.includes(".."))); }
  for (const item of GATEWAY_HARDENING_STAGES.filter(item => item.formatAfter.length)) {
    const index = calls.findIndex(call => basename(call.args[0]) === item.script);
    assert.deepEqual(calls[index + 1].args, ["-w", ...item.formatAfter]);
  }
  assert.equal(result.compiled, false); assert.equal(result.installed, false); assert.equal(result.recipe, "gateway.13");
}));
test("a wrong pin, Git checkout, previous hardening or symlink marker fails before any command", async () => {
  for (const kind of ["pin", "git", "previous", "symlink"]) await fixture(async root => {
    if (kind === "pin") await writeFile(join(root, ".lexopen-source-commit"), "wrong\n");
    if (kind === "git") await writeFile(join(root, ".git"), "fixture");
    if (kind === "previous") await writeFile(join(root, ".lexopen-computer-use-policy"), "v1\n");
    if (kind === "symlink") { await rm(join(root, ".lexopen-source-commit")); await writeFile(join(root, "marker"), PINNED_COMMIT); await symlink(join(root, "marker"), join(root, ".lexopen-source-commit")); }
    let commands = 0; await assert.rejects(prepareGatewaySource(root, { execute: async () => { commands++; } })); assert.equal(commands, 0);
  });
});
test("a failed test never mutates source and a failed hardener is not retried or followed by later stages", async () => {
  for (const fail of ["harden-cloud-file-connectors.test.mjs", "harden-computer-use-policy.mjs"]) await fixture(async root => {
    const calls = [];
    await assert.rejects(prepareGatewaySource(root, { execute: async (_binary, args) => { calls.push(basename(args[0])); if (basename(args[0]) === fail) throw new Error("synthetic private output never forwarded"); } }), error => { assert.ok(!error.message.includes("synthetic private output")); return true; });
    assert.equal(calls.at(-1), fail); assert.equal(calls.filter(name => name === fail).length, 1); assert.equal(calls.includes("harden-oauth-alias-create.mjs"), false);
    if (fail.endsWith(".test.mjs")) assert.ok(calls.every(name => name.endsWith(".test.mjs")));
  });
});
