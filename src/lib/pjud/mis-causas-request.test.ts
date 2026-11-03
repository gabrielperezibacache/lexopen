import assert from "node:assert/strict";
import { parseMisCausasRequest } from "@/lib/pjud/mis-causas-request";

async function main() {
  const request = (body?: string) => new Request("http://fixture.invalid/api/pjud/mis-causas", { method: "POST", body });
  assert.deepEqual(await parseMisCausasRequest(request()), {});
  assert.deepEqual(await parseMisCausasRequest(request('{"action":"sync","syncMovimientos":false}')), { action: "sync", syncMovimientos: false });
  for (const body of ['{"action":', '{"action":"typo"}', '{"wait":"false"}', 'null', '[]', '{"unexpected":true}']) {
    await assert.rejects(parseMisCausasRequest(request(body)), (error: unknown) => error instanceof Error, `invalid body must not become global sync: ${body}`);
  }
  console.log("pjud/mis-causas-request.test.ts OK");
}

main().catch((error) => { console.error(error); process.exit(1); });
