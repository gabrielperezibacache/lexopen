import assert from "node:assert/strict";
import { handleRouteError, httpError } from "@/lib/api";
import { privatePjudJson, privatePjudResponse } from "@/lib/pjud/private-response";
import { parseMisCausasRequest } from "@/lib/pjud/mis-causas-request";

async function main() {
  const responses = [
    privatePjudJson({ status: "fixture" }),
    privatePjudJson({ started: true }, { status: 202 }),
    privatePjudResponse(handleRouteError(httpError("No autorizado", 401))),
    privatePjudResponse(handleRouteError(httpError("Sin permiso", 403))),
  ];
  try {
    await parseMisCausasRequest(new Request("http://fixture.invalid", { method: "POST", body: '{"action":' }));
    assert.fail("malformed JSON must fail");
  } catch (error) {
    const response = privatePjudResponse(handleRouteError(error));
    assert.equal(response.status, 400);
    responses.push(response);
  }
  for (const response of responses) {
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("Vary"), "Cookie");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  }
  console.log("pjud/private-response.test.ts OK");
}

main().catch((error) => { console.error(error); process.exit(1); });
