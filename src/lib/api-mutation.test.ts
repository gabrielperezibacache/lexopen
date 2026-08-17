import assert from "node:assert/strict";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/csrf-constants";
import { withCsrfHeaders } from "@/lib/client-csrf";
import { apiMutation } from "@/lib/api-mutation";

async function main() {
  const withoutDoc = withCsrfHeaders({ "Content-Type": "application/json" });
  assert.equal(withoutDoc.get("Content-Type"), "application/json");
  assert.equal(withoutDoc.get(CSRF_HEADER), null);

  const prevDocument = (globalThis as { document?: unknown }).document;
  (globalThis as { document: { cookie: string } }).document = {
    cookie: `${CSRF_COOKIE}=tok123; other=1`,
  };

  try {
    const withToken = withCsrfHeaders();
    assert.equal(withToken.get(CSRF_HEADER), "tok123");

    const existing = withCsrfHeaders({ [CSRF_HEADER]: "keep-me" });
    assert.equal(existing.get(CSRF_HEADER), "keep-me");

    const origFetch = globalThis.fetch;

    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const network = await apiMutation("/api/x", { method: "POST" });
    assert.equal(network.ok, false);
    if (!network.ok) {
      assert.equal(network.error, "Error de red");
      assert.equal(network.status, 0);
    }

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 403,
      })) as typeof fetch;
    const denied = await apiMutation("/api/x", { method: "POST" });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.error, "No autorizado");
      assert.equal(denied.status, 403);
      assert.deepEqual(denied.data, { error: "No autorizado" });
    }

    globalThis.fetch = (async (_input, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get(CSRF_HEADER), "tok123");
      return new Response(JSON.stringify({ ok: true, id: "1" }), { status: 200 });
    }) as typeof fetch;
    const ok = await apiMutation<{ ok: boolean; id: string }>("/api/x", {
      method: "POST",
    });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.data.id, "1");

    globalThis.fetch = origFetch;
  } finally {
    if (prevDocument === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as { document: unknown }).document = prevDocument;
    }
  }

  console.log("api-mutation.test.ts OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
