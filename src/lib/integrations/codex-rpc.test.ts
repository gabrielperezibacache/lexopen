import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CodexRpc, CodexTransportError } from "./codex-rpc";

const fixture = path.resolve("src/lib/integrations/fixtures/codex-app-server.mjs");
async function rpcRun(run: (rpc: CodexRpc) => Promise<void>, extra: { timeoutMs?: number; maxMessageBytes?: number } = {}) {
  const home = await mkdtemp(path.join(tmpdir(), "lexopen-codex-rpc-test-"));
  const rpc = new CodexRpc({ executable: process.execPath, args: [fixture], cwd: home, env: { NODE_ENV: "test", CODEX_HOME: home }, ...extra });
  try { await rpc.initialize(); await run(rpc); } finally { rpc.close(); await new Promise(resolve => setTimeout(resolve, 30)); await rm(home, { recursive: true, force: true }); }
}
test("Codex stdio: correlates concurrent replies and initializes once", async () => rpcRun(async rpc => {
  const values = await Promise.all([rpc.request("echo", { value: "uno" }), rpc.request("echo", { value: "dos" })]);
  assert.deepEqual(values, [{ value: "uno" }, { value: "dos" }]);
}));
test("Codex stdio: doesn't expose provider diagnostics", async () => rpcRun(async rpc => {
  await assert.rejects(rpc.request("remote-error"), error => error instanceof CodexTransportError && error.code === "remote" && !/SECRET/.test(error.message));
}));
test("Codex stdio: malformed or over-limit frames terminate the connection", async () => {
  await rpcRun(async rpc => { await assert.rejects(rpc.request("invalid"), error => error instanceof CodexTransportError && error.code === "protocol"); assert.equal(rpc.alive, false); });
  await rpcRun(async rpc => { await assert.rejects(rpc.request("empty-response"), error => error instanceof CodexTransportError && error.code === "protocol"); });
  await rpcRun(async rpc => { await assert.rejects(rpc.request("oversize"), error => error instanceof CodexTransportError && error.code === "protocol"); }, { maxMessageBytes: 1000 });
});
test("Codex stdio: deadlines reject pending requests and stop the child", async () => rpcRun(async rpc => {
  await assert.rejects(rpc.request("hang"), error => error instanceof CodexTransportError && error.code === "timeout"); assert.equal(rpc.alive, false);
}, { timeoutMs: 300 }));
