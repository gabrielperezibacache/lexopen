#!/usr/bin/env node
// A guarded local protocol double. It never opens a network connection.
import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

const home = path.resolve(process.env.CODEX_HOME || "."), base = path.dirname(home);
if (!/^lexopen-codex-e2e(?:[-_][a-zA-Z0-9_-]+)?$/.test(path.basename(base)) || !/^[a-f0-9]{64}$/.test(path.basename(home)) || !process.argv.includes("app-server") || !process.argv.includes("stdio://")) {
  process.stderr.write("Codex browser fixture requires an isolated test home and stdio app-server.\n");
  process.exit(2);
}
for (const name of ["DATABASE_URL", "E2E_DATABASE_URL", "SESSION_SECRET", "OPENAI_API_KEY", "S3_SECRET_ACCESS_KEY", "NODE_OPTIONS"]) {
  if (process.env[name]) { process.stderr.write("The Codex child inherited a forbidden Host variable.\n"); process.exit(3); }
}

const approval = path.join(home, "approval.json"), ledger = path.join(home, "requests.jsonl");
const email = `codex-${path.basename(home).slice(0, 8)}@example.test`;
const loginId = "login_e2e", threadId = "thread_e2e", turnId = "turn_e2e";
let pendingLogin = false;
function approved() {
  try { return existsSync(approval) && JSON.parse(readFileSync(approval, "utf8")).approved === true; }
  catch { return false; }
}
const send = value => process.stdout.write(JSON.stringify(value) + "\n");
const result = (id, value) => send({ id, result: value });
const notify = (method, params) => send({ method, params });
function reject(id) { send({ id, error: { code: -32601, message: "Unsupported test request" } }); }

for await (const line of readline.createInterface({ input: process.stdin })) {
  let message;
  try { message = JSON.parse(line); } catch { process.exit(4); }
  const { id, method, params } = message;
  if (typeof method !== "string") continue;
  // Record only method names. Prompts, secrets and document content stay out.
  appendFileSync(ledger, JSON.stringify({ method }) + "\n", { mode: 0o600 });
  if (method === "initialize") result(id, { userAgent: "lexopen-codex-browser-fixture" });
  else if (method === "initialized") {}
  else if (method === "account/read") {
    if (pendingLogin && approved()) { pendingLogin = false; notify("account/login/completed", { loginId, success: true }); }
    result(id, { account: approved() ? { type: "chatgpt", email, planType: "plus", accessToken: "TEST_ONLY_ACCESS_TOKEN_NEVER_EXPOSE" } : null, requiresOpenaiAuth: true });
  } else if (method === "account/login/start" && params?.type === "chatgptDeviceCode") {
    pendingLogin = true;
    result(id, { type: "chatgptDeviceCode", loginId, verificationUrl: "https://auth.openai.com/codex/device", userCode: "DEMO-1234" });
  } else if (method === "account/login/cancel") {
    pendingLogin = false; result(id, {});
    notify("account/login/completed", { loginId, success: false, error: null });
  } else if (method === "account/logout") {
    pendingLogin = false; rmSync(approval, { force: true }); result(id, {});
  } else if (method === "model/list" && approved()) {
    result(id, { data: [{ id: "fixture-model", model: "codex-e2e", displayName: "Codex de demostración", isDefault: true }], nextCursor: null });
  } else if (method === "thread/start" && approved()) {
    if (params?.sandbox !== "read-only" || params?.approvalPolicy !== "never" || params?.ephemeral !== true) { reject(id); continue; }
    result(id, { thread: { id: threadId, ephemeral: true } });
  } else if (method === "turn/start" && approved()) {
    if (params?.threadId !== threadId || params?.approvalPolicy !== "never" || params?.sandboxPolicy?.type !== "readOnly") { reject(id); continue; }
    result(id, { turn: { id: turnId, status: "inProgress" } });
    notify("item/agentMessage/delta", { threadId, turnId, itemId: "answer", delta: "Conexión de LexOpen comprobada." });
    notify("turn/completed", { threadId, turn: { id: turnId, status: "completed", items: [] } });
  } else reject(id);
}
