import assert from "node:assert/strict";
import { test } from "node:test";
import { containerArgs, dockerConfig, runtimeCapabilities, assertPlainDocx, executeDocumentRecipe, type CommandRunner } from "./runtime";
const config = { enabled: true, imageId: "sha256:" + "a".repeat(64), host: "unix:///var/run/docker.sock", executable: "docker" };
test("disabled or unpinned runtime never executes a Docker command", async () => {
  let calls = 0; const command: CommandRunner = async () => { calls++; throw Error("unexpected"); };
  assert.equal((await runtimeCapabilities({ ...config, enabled: false }, command)).available, false);
  assert.equal((await runtimeCapabilities({ ...config, imageId: "latest" }, command)).available, false);
  assert.equal((await runtimeCapabilities({ ...config, host: "tcp://example.invalid:2375" }, command)).available, false);
  assert.equal(calls, 0);
});
test("preflight requires the exact local image ID and Linux daemon", async () => {
  assert.equal((await runtimeCapabilities(config, async args => args[0] === "image" ? config.imageId : "linux")).available, true);
  assert.equal((await runtimeCapabilities(config, async () => "sha256:" + "b".repeat(64))).available, false);
});
test("recipe arguments enforce local process isolation and never mount credentials or Docker socket", () => {
  const args = containerArgs(config, "lexopen-workbench-12345678-1234-1234-1234-123456789abc", "/tmp/fictitious/input", "/tmp/fictitious/output");
  for (const pair of [["--network", "none"], ["--user", "65532:65532"], ["--cap-drop", "ALL"], ["--security-opt", "no-new-privileges"], ["--pids-limit", "64"], ["--memory", "256m"], ["--cpus", "1"], ["--pull", "never"]]) assert.equal(args[args.indexOf(pair[0]) + 1], pair[1]);
  assert.ok(args.includes("--read-only")); assert.ok(args.includes("type=bind,src=/tmp/fictitious/input,dst=/input,readonly"));
  assert.ok(!args.some(value => /docker.sock|storage|\.env|CODEX_HOME/.test(value)));
  assert.equal(args.at(-1), config.imageId);
  assert.throws(() => containerArgs(config, "injected --privileged", "/tmp/input", "/tmp/output"));
  assert.throws(() => containerArgs(config, "lexopen-workbench-12345678-1234-1234-1234-123456789abc", "/tmp/input,readonly=false", "/tmp/output"));
});
test("a made-up Word file never qualifies as a real DOCX", () => { assert.throws(() => assertPlainDocx(Buffer.from("renamed text"))); });
test("runtime configuration is disabled by default", () => { assert.equal(dockerConfig({ NODE_ENV: "test" }).enabled, false); });
test("cancellation reaches the running transport and always stops its named container", async () => {
  const calls: string[][] = [], control = new AbortController();
  let entered!: () => void; const running = new Promise<void>(resolve => { entered = resolve; });
  const command: CommandRunner = async (args, options) => {
    calls.push(args);
    if (args[0] === "image") return config.imageId;
    if (args[0] === "info") return "linux";
    if (args[0] === "run") { assert.equal(options.signal, control.signal); entered(); return new Promise((_resolve, reject) => { options.signal!.addEventListener("abort", () => reject(Error("fixture stopped")), { once: true }); }); }
    return "";
  };
  const execution = executeDocumentRecipe({ version: 1, title: "Fixture", body: "Fictitious only", sources: [{ marker: "R1", title: "Fixture", quote: "Fictitious", href: "/documentos/fixture/fuentes", versionId: "fixture", sourceSha256: "a".repeat(64) }] }, control.signal, { config, command });
  await running; control.abort(); await assert.rejects(execution, /fixture stopped/);
  const run = calls.find(args => args[0] === "run")!, stop = calls.find(args => args[0] === "rm")!;
  assert.deepEqual(stop, ["rm", "--force", run[run.indexOf("--name") + 1]]);
});
