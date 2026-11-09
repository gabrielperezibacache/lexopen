// A local protocol double. It never contacts OpenAI or runs model tools.
import readline from "node:readline";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const scenario = process.argv.find(value => value.startsWith("--scenario="))?.slice(11) || "normal";
const home = process.env.CODEX_HOME || process.cwd();
const credential = path.join(home, "fake-auth.json"), trace = path.join(home, "trace.jsonl");
let connected = ["connected", "hang", "tool", "tool-event", "failed"].includes(scenario) || existsSync(credential) && Boolean(JSON.parse(readFileSync(credential, "utf8"))), loginTimer;
writeFileSync(path.join(home, "fake-environment.json"), JSON.stringify(process.env));
writeFileSync(path.join(home, "fake-arguments.json"), JSON.stringify(process.argv.slice(2)));
const send = value => process.stdout.write(JSON.stringify(value) + "\n");
const result = (id, value) => send({ id, result: value });
const notify = (method, params) => send({ method, params });
for await (const line of readline.createInterface({ input: process.stdin })) {
  const message = JSON.parse(line); appendFileSync(trace, JSON.stringify(message) + "\n");
  if (!message.method) continue;
  const { id, method, params } = message;
  if (method === "initialize") result(id, { userAgent: "lexopen-test" });
  else if (method === "initialized") {}
  else if (method === "account/read") result(id, { account: connected ? { type: "chatgpt", email: "codex-demo@example.test", planType: "plus", accessToken: "SHOULD_NEVER_LEAVE" } : null, requiresOpenaiAuth: true });
  else if (method === "account/login/start") {
    result(id, { type: "chatgptDeviceCode", loginId: "login_test", verificationUrl: scenario === "bad-url" ? "https://evil.example/codex/device" : "https://auth.openai.com/codex/device", userCode: "DEMO-1234" });
    if (scenario === "login-failed") notify("account/login/completed", { loginId: "login_test", success: false, error: "SECRET_FROM_PROVIDER" });
    else loginTimer = setTimeout(() => { connected = true; writeFileSync(credential, JSON.stringify({ accessToken: "SHOULD_NEVER_LEAVE" })); notify("account/login/completed", { loginId: "login_test", success: true }); }, 80);
  } else if (method === "account/login/cancel") { clearTimeout(loginTimer); result(id, {}); notify("account/login/completed", { loginId: "login_test", success: false, error: "SECRET_FROM_PROVIDER" }); }
  else if (method === "account/logout") { connected = false; writeFileSync(credential, "null"); result(id, {}); }
  else if (method === "model/list") result(id, { data: [{ id: "model_test", model: "codex-test", displayName: "Codex de prueba", isDefault: true }], nextCursor: null });
  else if (method === "thread/start") result(id, { thread: { id: "thread_test", ephemeral: true } });
  else if (method === "turn/start") {
    if (scenario === "hang") continue;
    result(id, { turn: { id: "turn_test", status: "inProgress" } });
    if (scenario === "tool") send({ id: 999, method: "item/commandExecution/requestApproval", params: { command: "cat SECRET" } });
    else if (scenario === "tool-event") notify("item/started", { threadId: "thread_test", item: { type: "fileChange" } });
    else {
      notify("item/agentMessage/delta", { threadId: "thread_test", turnId: "turn_test", itemId: "answer", delta: "Respuesta " });
      notify("item/agentMessage/delta", { threadId: "thread_test", turnId: "turn_test", itemId: "answer", delta: "de prueba." });
      notify("turn/completed", { threadId: "thread_test", turn: { id: "turn_test", status: scenario === "failed" ? "failed" : "completed", items: [], error: { message: "SECRET_FROM_PROVIDER" } } });
    }
  } else if (method === "invalid") process.stdout.write("not-json\n");
  else if (method === "empty-response") send({ id });
  else if (method === "oversize") process.stdout.write("x".repeat(5000));
  else if (method === "remote-error") { process.stderr.write("SECRET_FROM_STDERR\n"); send({ id, error: { code: -1, message: "SECRET_FROM_PROVIDER" } }); }
  else if (method === "echo") result(id, params);
  else if (method === "hang") {}
  else if (method === "read-credential") result(id, readFileSync(credential, "utf8"));
  else send({ id, error: { code: -32601, message: "unknown" } });
}
