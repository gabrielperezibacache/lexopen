/** Opt-in protocol smoke against an installed CLI, using only temporary homes and fake data. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CodexSessionManager } from "./codex-session";
import type { CodexRpc } from "./codex-rpc";

const executable = process.env.LEXOPEN_TEST_CODEX_BIN;
const identity = (actor: string) => createHash("sha256").update(actor).digest("hex");

test("real Codex isolates profiles and rejects inherited MCP before it can start", { skip: !executable, timeout: 20_000 }, async () => {
  const base = await mkdtemp(path.join(tmpdir(), "lexopen-codex-real-test-"));
  const safeHome = path.join(base, identity("safe")), badHome = path.join(base, identity("bad"));
  const marker = path.join(base, "mcp-must-not-start");
  await mkdir(safeHome); await mkdir(badHome);
  const fakeCommand = `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "fixture")`;
  await writeFile(path.join(safeHome, "config.toml"), `[permissions.lexopen_text.filesystem]\n"/" = "read"\n[mcp_servers.disabled]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ["-e", ${JSON.stringify(fakeCommand)}]\nenabled = false\n`);
  await writeFile(path.join(badHome, "config.toml"), `[mcp_servers.fixture]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ["-e", ${JSON.stringify(fakeCommand)}]\n`);
  const manager = new CodexSessionManager({ baseDir: base, executable });
  try {
    const safe = await manager.status("safe");
    assert.equal(safe.status, "disconnected", "a stale profile must not expand the new session");
    const session = await (manager as unknown as { session(actor: string): Promise<{ rpc: CodexRpc; cwd: string; profile: string }> }).session("safe");
    const config = await session.rpc.request<{ config: { permissions: Record<string, { filesystem: Record<string, unknown>; network: { enabled: boolean } }> } }>("config/read", { includeLayers: false });
    assert.deepEqual(Object.keys(config.config.permissions[session.profile].filesystem).filter(key => key !== "glob_scan_max_depth"), [session.cwd]);
    assert.equal(config.config.permissions[session.profile].network.enabled, false);
    const thread = await session.rpc.request<{ thread: { id: string } }>("thread/start", { model: "codex-test", cwd: session.cwd, approvalPolicy: "never", permissions: session.profile, ephemeral: true, config: { mcp_servers: {} } });
    assert.ok(thread.thread.id, "a disabled inherited MCP must not prevent starting an isolated thread");
    assert.equal((await manager.status("bad")).status, "disconnected");
    const bad = await (manager as unknown as { session(actor: string): Promise<{ rpc: CodexRpc }> }).session("bad");
    const request = bad.rpc.request.bind(bad.rpc);
    bad.rpc.request = (<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T> =>
      method === "account/read" ? Promise.resolve({ account: { type: "chatgpt" } } as T) : request(method, params, timeoutMs) as Promise<T>);
    await assert.rejects(manager.complete("bad", [{ role: "user", content: "Texto ficticio" }], { model: "codex-test" }), /servidores MCP/);
    assert.equal((await manager.disconnect("bad")).connected, false);
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(await stat(marker).then(() => true, () => false), false, "an inherited MCP command must never start");
  } finally {
    await manager.closeAll();
    await rm(base, { recursive: true, force: true });
  }
});

test("real Codex rejects an MCP configured after the session opened", { skip: !executable, timeout: 20_000 }, async () => {
  const base = await mkdtemp(path.join(tmpdir(), "lexopen-codex-late-test-"));
  const marker = path.join(base, "mcp-must-not-start");
  const manager = new CodexSessionManager({ baseDir: base, executable });
  try {
    assert.equal((await manager.status("late")).status, "disconnected");
    const session = await (manager as unknown as { session(actor: string): Promise<{ rpc: CodexRpc; home: string }> }).session("late");
    const fakeCommand = `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "fixture")`;
    await writeFile(path.join(session.home, "config.toml"), `[mcp_servers.fixture]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ["-e", ${JSON.stringify(fakeCommand)}]\n`);
    const request = session.rpc.request.bind(session.rpc);
    session.rpc.request = (<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T> =>
      method === "account/read" ? Promise.resolve({ account: { type: "chatgpt" } } as T) : request(method, params, timeoutMs) as Promise<T>);
    await assert.rejects(manager.complete("late", [{ role: "user", content: "Texto ficticio" }], { model: "codex-test" }), /servidores MCP/);
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(await stat(marker).then(() => true, () => false), false);
  } finally {
    await manager.closeAll();
    await rm(base, { recursive: true, force: true });
  }
});
