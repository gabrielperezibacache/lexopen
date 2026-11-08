import assert from "node:assert/strict";
import { KittiesGateway } from "./gateway";

const connector = "altazor-google-0123456789abcdef";
const run = async (supportsFiles: boolean) => {
  const calls: { path: string; method: string }[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    const path = new URL(String(url)).pathname, method = String(options?.method || "GET");
    calls.push({ path, method });
    if (path === "/v1/health") return Response.json({ ok: true, lexopen_connector_gate: "v1", ...(supportsFiles ? { lexopen_file_reads: "v1" } : {}) });
    if (path === "/v1/kitties" && method === "POST") return Response.json({ kitty: { id: "owned-kitty", name: "owned-kitty", provider: "local-model", desktop: true, container: "real-container", status: "stopped", connectors: [connector], approvals: "ask", backup: "" } });
    throw new Error("Unexpected request");
  };
  const client = new KittiesGateway("http://127.0.0.1:7494", "fictitious-gateway-token", fetcher);
  if (supportsFiles) assert.equal((await client.createKitty("owned-kitty", "local-model", [connector], false)).id, "owned-kitty");
  else await assert.rejects(client.createKitty("owned-kitty", "local-model", [connector], false), error => error instanceof Error && error.message.includes("archivos completos"));
  assert.equal(calls.filter(call => call.method === "POST").length, supportsFiles ? 1 : 0);
};
void (async () => {
  await run(false);
  await run(true);
  console.log("File-capable gateway required before creating a desktop with easy connected accounts PASS.");
})().catch(error => { console.error(error); process.exitCode = 1; });
