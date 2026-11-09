import assert from "node:assert/strict";
import { searchPublicPjudJudgments, fetchPublicLegalSource } from "./sources";
async function main() {
  let session = 0, posts = 0, expire = 1;
  const controller = new AbortController();
  let abortOnExpiry = false;
  const transport: typeof fetch = async (url, init) => {
    if (String(url).endsWith("?Civiles")) {
      session++;
      return new Response(`<input name="_token" value="csrf-${session}"><script>id_buscador_activo=${300 + session}</script>`, { headers: { "Set-Cookie": `guest=${session}; Secure` } });
    }
    posts++;
    const params = new URLSearchParams(String(init?.body));
    assert.equal(params.get("_token"), `csrf-${session}`);
    assert.equal(params.get("id_buscador"), String(300 + session));
    assert.equal(new Headers(init?.headers).get("cookie"), `guest=${session}`);
    if (posts <= expire) {
      if (abortOnExpiry) controller.abort();
      return new Response("csrf expired", { status: 419 });
    }
    return new Response(JSON.stringify({ response: { numFound: 1, docs: [{ id: 123, rol_era_sup_s: "3630-2023", texto_sentencia: "Texto completo de prueba" }] } }), { headers: { "Content-Type": "application/json" } });
  };
  const result = await searchPublicPjudJudgments({ terms: "", rol: "3630-2023", page: 0 }, { fetch: transport });
  assert.equal(result.items[0].id, "123"); assert.equal(session, 2); assert.equal(posts, 2);
  session = posts = 0;
  assert.equal((await fetchPublicLegalSource("https://juris.pjud.cl/busqueda?Civiles#sentencia-123", { fetch: transport })).text, "Texto completo de prueba");
  assert.equal(session, 2); assert.equal(posts, 2);
  session = posts = 0; expire = 10;
  await assert.rejects(searchPublicPjudJudgments({ terms: "", rol: "3630", page: 0 }, { fetch: transport }));
  assert.equal(session, 2); assert.equal(posts, 2, "never loops on persistent expiry");
  session = posts = 0; abortOnExpiry = true;
  await assert.rejects(searchPublicPjudJudgments({ terms: "", rol: "3630", page: 0 }, { fetch: transport, signal: controller.signal }));
  assert.equal(session, 1, "cancellation prevents renewing the session");
  let failures = 0;
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(searchPublicPjudJudgments({ terms: "", rol: "3630", page: 0 }, { fetch: async () => { failures++; return new Response("failure", { status }); } }));
  }
  assert.equal(failures, 4, "does not retry authentication, blocking or server errors");
  abortOnExpiry = false;
  for (const status of [401, 403, 429, 500]) {
    session = 0;
    let postFailures = 0;
    const rejectingPost: typeof fetch = async (url, init) => {
      if (init?.method === "POST") { postFailures++; return new Response("rejected", { status }); }
      return transport(url, init);
    };
    await assert.rejects(searchPublicPjudJudgments({ terms: "", rol: "3630", page: 0 }, { fetch: rejectingPost }));
    assert.equal(session, 1); assert.equal(postFailures, 1, "only CSRF expiry can renew the session");
  }

  console.log("PJUD sessions: one complete CSRF renewal, bounded attempts, no credential reuse and cancellation OK");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
