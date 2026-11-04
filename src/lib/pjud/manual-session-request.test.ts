import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { manualOjvLocalRequest, manualOjvQuerySession, parseManualOjvRequest } from "@/lib/pjud/manual-session-request";
import { POST } from "@/app/api/pjud/manual-session/route";

function request(body: unknown) { return new Request("http://localhost:3000/api/pjud/manual-session", { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify(body) }); }
async function main() {
  const id = randomUUID();
  assert.equal(manualOjvLocalRequest(request({})), true);
  assert.equal(manualOjvLocalRequest(new NextRequest("http://127.0.0.1:3000/api/pjud/manual-session", { headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" } })), true, "Next's normalized URL must retain the real loopback Host/origin");
  assert.equal(manualOjvLocalRequest(new NextRequest("http://0.0.0.0:3000/api/pjud/manual-session", { headers: { host: "localhost:3000", origin: "http://localhost:3000" } })), true, "the local web Host binds all interfaces without changing the browser's origin");
  assert.equal(manualOjvLocalRequest(new NextRequest("http://0.0.0.0:3000/api/pjud/manual-session", { headers: { host: "external.invalid:3000", origin: "http://external.invalid:3000" } })), false);
  assert.equal(manualOjvLocalRequest(new Request("http://localhost:3000/api/pjud/manual-session", { headers: { host: "localhost:3000", origin: "https://external.invalid", "x-forwarded-for": "127.0.0.1" } })), false);
  assert.equal(manualOjvLocalRequest(new Request("https://external.invalid/api/pjud/manual-session", { headers: { host: "localhost:3000", origin: "http://localhost:3000" } })), false);
  assert.equal(manualOjvLocalRequest(new Request("http://localhost:3000/api/pjud/manual-session", { headers: { host: "localhost:3000", "sec-fetch-site": "cross-site" } })), false);
  assert.equal(manualOjvLocalRequest(new Request("http://[::1]:3000/api/pjud/manual-session", { headers: { host: "[::1]:3000", referer: "http://[::1]:3000/causas/mis-causas" } })), true);
  assert.deepEqual(await parseManualOjvRequest(request({ action: "start" })), { action: "start" });
  assert.deepEqual(await parseManualOjvRequest(request({ action: "focus", sessionId: id })), { action: "focus", sessionId: id });
  assert.deepEqual(await parseManualOjvRequest(request({ action: "list", sessionId: id, materias: ["Civil"] })), { action: "list", sessionId: id, materias: ["Civil"] });
  for (const body of [
    { action: "start", password: "PRIVATE_PASSWORD" }, { action: "start", cookies: [] },
    { action: "focus" }, { action: "focus", sessionId: "not-a-uuid" },
    { action: "focus", sessionId: id, url: "https://external.invalid" },
    { action: "focus", sessionId: id, cookies: [] },
    { action: "import", sessionId: id, candidateIds: [randomUUID()], html: "PRIVATE_HTML" },
    { action: "import", sessionId: id, candidateIds: [id, id] },
    { action: "list", sessionId: id, materias: ["arbitrary"] },
    { action: "import", sessionId: id, candidateIds: Array.from({ length: 21 }, () => randomUUID()) },
    { action: "sync", sessionId: id, causaId: "arbitrary-database-id" },
  ]) await assert.rejects(parseManualOjvRequest(request(body)));
  const crossOrigin = await POST(new NextRequest("http://localhost:3000/api/pjud/manual-session", { method: "POST", headers: { host: "localhost:3000", origin: "https://external.invalid", "content-type": "application/json" }, body: JSON.stringify({ action: "focus", sessionId: id }) }));
  assert.equal(crossOrigin.status, 403, "the focus mutation must reject CSRF before authentication or database access");
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(16_385))); controller.close(); } });
  await assert.rejects(parseManualOjvRequest(new Request("http://localhost:3000/api/pjud/manual-session", { method: "POST", body: stream, duplex: "half" } as RequestInit)), (error: unknown) => Boolean(error && typeof error === "object" && "status" in error && error.status === 413));
  assert.equal(manualOjvQuerySession(new Request(`http://localhost/api/pjud/manual-session?sessionId=${id}`)), id);
  assert.throws(() => manualOjvQuerySession(new Request(`http://localhost/api/pjud/manual-session?sessionId=${id}&sessionId=${id}`)));
  assert.throws(() => manualOjvQuerySession(new Request("http://localhost/api/pjud/manual-session?cookies=PRIVATE")));
  console.log("Manual OJV request: strict actions, bounded streamed bodies, opaque selections and local origin checks passed (zero network/database).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
