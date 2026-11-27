import assert from "node:assert/strict";
import { parseMisCausasRequest, shouldProcessMisCausasInline } from "@/lib/pjud/mis-causas-request";

async function main() {
  const request = (body?: string) => new Request("http://fixture.invalid/api/pjud/mis-causas", { method: "POST", body });
  assert.deepEqual(await parseMisCausasRequest(request()), {});
  assert.deepEqual(await parseMisCausasRequest(request('{"action":"sync","syncMovimientos":false}')), { action: "sync", syncMovimientos: false });
  assert.deepEqual(await parseMisCausasRequest(request('{"downloadDocuments":true}')), { downloadDocuments: true });
  await assert.rejects(parseMisCausasRequest(request('{"downloadDocuments":"yes"}')));
  for (const body of ['{"action":', '{"action":"typo"}', '{"wait":"false"}', 'null', '[]', '{"unexpected":true}']) {
    await assert.rejects(parseMisCausasRequest(request(body)), (error: unknown) => error instanceof Error, `invalid body must not become global sync: ${body}`);
  }
  assert.equal(shouldProcessMisCausasInline({ cron: true, wait: true }), false, "scheduled cron keeps its enqueue-only contract");
  assert.equal(shouldProcessMisCausasInline({ cron: true }), false);
  assert.equal(shouldProcessMisCausasInline({ cron: false, wait: true }), true, "explicit manual wait drains its own jobs");
  assert.equal(shouldProcessMisCausasInline({ cron: false }), false, "ordinary async UI requests do not drain inline");
  console.log("pjud/mis-causas-request.test.ts OK");
}

main().catch((error) => { console.error(error); process.exit(1); });
