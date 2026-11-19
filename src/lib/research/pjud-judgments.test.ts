import assert from "node:assert/strict";
import { fetchPublicLegalSource, validatePublicLegalSourceUrl } from "./sources";
async function main() {
const url = "https://juris.pjud.cl/busqueda?Civiles#sentencia-123";
assert.equal(validatePublicLegalSourceUrl(url), url);
for (const bad of [url.replace("juris.pjud.cl", "juris.pjud.cl.evil.org"), url.replace("123", "0"), url.replace("Civiles", "Familia"), url.replace("#sentencia-123", "&k=secret"), url.replace("https:", "http:")]) assert.throws(() => validatePublicLegalSourceUrl(bad));
let calls = 0;
let result: unknown = { response: { docs: [{ id: 123, rol_era_sup_s: "3630-2023", texto_sentencia: "<p>Texto íntegro &amp; literal</p>", texto_sentencia_preview: "Preview prohibido" }] } };
const transport: typeof fetch = async (input, init) => {
  calls++;
  assert.equal(init?.redirect, "error");
  if (String(input).endsWith("?Civiles")) return new Response('<input value="csrf-test" name="_token"><script>id_buscador_activo = 328;</script>', { headers: { "Set-Cookie": "anonymous=fresh; Secure; HttpOnly" } });
  assert.equal(String(input), "https://juris.pjud.cl/busqueda/buscar_sentencias");
  assert.equal(init?.method, "POST");
  assert.equal(new Headers(init?.headers).get("cookie"), "anonymous=fresh");
  assert.deepEqual(JSON.parse(new URLSearchParams(String(init?.body)).get("filtros")!), { id: 123 });
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
};
const source = await fetchPublicLegalSource(url, { fetch: transport });
assert.equal(source.text, "Texto íntegro & literal");
assert.equal(source.externalId, "PJUD:123");
assert.equal(source.kind, "jurisprudence");
assert.equal(source.mimeType, "application/json");
assert.deepEqual(JSON.parse(source.rawBytes.toString()), { format: "lexopen.pjud.public.v1", id: "123", rol: "3630-2023", source: url, text: source.text });
await fetchPublicLegalSource(url, { fetch: transport });
assert.equal(calls, 4, "fresh session for every selection");
for (const docs of [[{ id: 124, texto_sentencia: "wrong identity" }], [{ id: 123, texto_sentencia_preview: "preview only" }], [{ id: 123, texto_sentencia: "ANONIMIZADO" }], [], [{ id: 123, texto_sentencia: "one" }, { id: 124, texto_sentencia: "extra" }]]) {
  result = { response: { docs } }; await assert.rejects(fetchPublicLegalSource(url, { fetch: transport }));
}
result = { response: { docs: [{ id: 123, sit_fallo_anonimizado_i: 1, texto_sentencia: "Identidad sin anonimizar", texto_sentencia_anon: 'Texto anonimizado conservado<span hidden>Identidad sin anonimizar</span><script>Identidad sin anonimizar</script>' }] } };
const publicCopy = await fetchPublicLegalSource(url, { fetch: transport });
assert.equal(publicCopy.text, "Texto anonimizado conservado");
assert.equal(JSON.parse(publicCopy.rawBytes.toString()).text, publicCopy.text);
assert.doesNotMatch(JSON.stringify(publicCopy, (key, val) => key === "rawBytes" ? publicCopy.rawBytes.toString() : val), /Identidad sin anonimizar/);
for (const anon of [undefined, null, "", " ", "<p>[ANONIMIZADO]</p>", "(Texto reservado)", "Sentencia no disponible"]) {
  result = { response: { docs: [{ id: 123, sit_fallo_anonimizado_i: 1, texto_sentencia: "Identidad sin anonimizar", texto_sentencia_anon: anon }] } };
  await assert.rejects(fetchPublicLegalSource(url, { fetch: transport }), /Texto público no disponible/);
}
for (const flag of [0, "0", false, undefined]) {
  const row = { id: 123, sit_fallo_anonimizado_i: flag, texto_sentencia: "Identidad sin anonimizar", texto_sentencia_anon: "Copia pública para citar" };
  result = { response: { docs: [row] } };
  const copy = await fetchPublicLegalSource(url, { fetch: transport });
  assert.equal(copy.text, row.texto_sentencia_anon);
  assert.ok(!copy.rawBytes.includes(row.texto_sentencia));
  for (const variant of ["[ANONIMIZADO]", "<span hidden>Identidad sin anonimizar</span>", 123]) {
    result = { response: { docs: [{ ...row, texto_sentencia_anon: variant }] } };
    await assert.rejects(fetchPublicLegalSource(url, { fetch: transport }), /Texto público no disponible/);
  }
  result = { response: { docs: [{ ...row, texto_sentencia: "Fallo de circulación pública", texto_sentencia_anon: " " }] } };
  if (flag === undefined) await assert.rejects(fetchPublicLegalSource(url, { fetch: transport }), /Texto público no disponible/);
  else assert.equal((await fetchPublicLegalSource(url, { fetch: transport })).text, "Fallo de circulación pública");
}
result = { response: { docs: [{ id: 123, sit_fallo_anonimizado_i: 1, texto_sentencia: "No usar", texto_sentencia_anon: "ANONIMIZADO" }] } };
await assert.rejects(fetchPublicLegalSource(url, { fetch: transport }));
await assert.rejects(fetchPublicLegalSource(url, { fetch: async () => new Response("redirect", { status: 302 }) }));
await assert.rejects(fetchPublicLegalSource(url, { fetch: transport, maxBytes: 10 }));
console.log("PJUD judgments: fresh anonymous session, identity, literal text, no previews, limits and closed URLs OK");

}
main().catch(error => { console.error(error); process.exitCode = 1; });
