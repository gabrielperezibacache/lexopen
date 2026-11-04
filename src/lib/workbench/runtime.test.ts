import assert from "node:assert/strict";
import { test } from "node:test";
import { containerArgs, dockerConfig, runtimeCapabilities, assertPlainDocx, executeDocumentRecipe, runDockerCommand, type CommandRunner } from "./runtime";
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
test("preflight reports the failed phase and safely diagnoses a missing CLI", async () => {
  const missing = await runtimeCapabilities({ ...config, executable: "lexopen-fixture-missing-docker-binary" });
  assert.equal(missing.reasonCode, "docker_cli_unavailable");
  assert.equal(missing.phase, "image_inspect");
  assert.equal(missing.attempts, 1);
  assert.equal(missing.checks?.[0].osError, "ENOENT");
  assert.equal(JSON.stringify(missing).includes("lexopen-fixture-missing"), false);
  const denied = await runtimeCapabilities(config, async args => {
    if (args[0] === "image") return config.imageId;
    throw Object.assign(new Error("private path https://secret.invalid?key=confidential"), { code: "untrusted_code", exitCode: 125, osError: "private_path" });
  });
  assert.equal(denied.reasonCode, "docker_command_failed");
  assert.equal(denied.phase, "daemon_info");
  assert.equal(denied.checks?.[1].exitCode, 125);
  assert.doesNotMatch(JSON.stringify(denied), /secret|confidential|private_path|untrusted_code/);
  await assert.rejects(runDockerCommand(["info"], { config: { ...config, executable: "lexopen-fixture-missing-docker-binary" }, timeoutMs: 1_000 }), (error: unknown) => (error as { code: string }).code === "docker_cli_unavailable");
});
test("cold command failures retry only with an explicit bounded preflight policy", async () => {
  let calls = 0;
  const cold: CommandRunner = async (args, options) => {
    calls++;
    assert.equal(options.timeoutMs, 10_000);
    if (calls === 1) throw Object.assign(new Error("fixture cold start"), { code: "docker_timeout" });
    return args[0] === "image" ? config.imageId : "linux";
  };
  const ready = await runtimeCapabilities(config, cold, { timeoutMs: 10_000, maxAttempts: 2 });
  assert.equal(ready.available, true);
  assert.deepEqual(ready.checks?.map(check => [check.phase, check.attempt, check.code]), [["image_inspect", 1, "docker_timeout"], ["image_inspect", 2, "ok"], ["daemon_info", 1, "ok"]]);
  calls = 0;
  const mismatched = await runtimeCapabilities(config, async () => { calls++; return "sha256:" + "b".repeat(64); }, { maxAttempts: 3 });
  assert.equal(mismatched.reasonCode, "image_id_mismatch"); assert.equal(calls, 1);
  const failed = await runtimeCapabilities(config, async () => { throw Object.assign(Error("fixture"), { code: "docker_timeout" }); }, { maxAttempts: 2 });
  assert.equal(failed.reasonCode, "docker_timeout"); assert.equal(failed.attempts, 2);
  const cancelled = new AbortController(); cancelled.abort();
  const stopped = await runtimeCapabilities(config, async () => { throw Error("unexpected command"); }, { signal: cancelled.signal, maxAttempts: 3 });
  assert.equal(stopped.reasonCode, "docker_cancelled"); assert.equal(stopped.attempts, 1);
  await assert.rejects(runtimeCapabilities(config, cold, { timeoutMs: 15_001 }), RangeError);
  await assert.rejects(runtimeCapabilities(config, cold, { maxAttempts: 4 }), RangeError);
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
