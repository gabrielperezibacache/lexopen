import assert from "node:assert/strict";
import test from "node:test";
import { KittiesGateway } from "./gateway";

function fixture(managed: boolean) {
  const requests: { path: string; method: string; body: unknown }[] = [];
  const client = new KittiesGateway("http://127.0.0.1:18197", "synthetic-drive-gateway", (async (raw, init) => {
    const path = new URL(String(raw)).pathname;
    requests.push({ path, method: init?.method || "GET", body: init?.body });
    assert.equal(path, "/v1/health", "capability tests never import credentials or query Drive");
    return Response.json({ ok: true, lexopen_persistent_oauth: "v1", ...(managed ? { lexopen_drive_management: "v1" } : {}) });
  }) as typeof fetch);
  return { client, requests };
}

test("Drive management is unavailable on a read-only motor before credential import", async () => {
  const { client, requests } = fixture(false);
  await assert.rejects(client.requireDriveManagement(), { code: "drive_management_required" });
  assert.equal(requests.length, 1);
  assert.ok(requests.every(row => row.method === "GET" && row.body === undefined));
});

test("a declared management capability can be checked without starting a model or a task", async () => {
  const { client, requests } = fixture(true);
  await client.requireDriveManagement();
  assert.deepEqual(requests, [{ path: "/v1/health", method: "GET", body: undefined }]);
});
