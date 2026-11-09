import assert from "node:assert/strict";
import { pjudSearchSchema } from "./pjud-search";
import { searchPublicPjudJudgments } from "./sources";
async function main() {
  assert.equal(pjudSearchSchema.safeParse({}).success, false);
  for (const input of [{ rol: "C-3630-2023", page: -1 }, { terms: "hola", page: 20 }, { rol: "anything" }, { terms: "x".repeat(201) }]) assert.equal(pjudSearchSchema.safeParse(input).success, false);
  let sessions = 0;
  let docs = [{ id: 123, rol_era_sup_s: "C-3630-2023", caratulado_s: "Caso de prueba", gls_juz_s: "Civil" }];
  const fetchMock: typeof fetch = async (url, init) => {
    if (String(url).endsWith("?Civiles")) { sessions++; return new Response('<input name="_token" value="csrf"><script>id_buscador_activo=328</script>', { headers: { "Set-Cookie": `session=${sessions}` } }); }
    const params = new URLSearchParams(String(init?.body)); const filters = JSON.parse(params.get("filtros")!);
    assert.equal(filters.rol, "3630"); assert.equal(filters.era, "2023"); assert.deepEqual(filters.filtros_omnibox, []);
    assert.equal(new Headers(init?.headers).get("cookie"), `session=${sessions}`);
    assert.equal(init?.redirect, "error");
    return new Response(JSON.stringify({ response: { docs, numFound: 30 } }), { headers: { "Content-Type": "application/json" } });
  };
  const input = { rol: "C-3630-2023", terms: "", page: 0 };
  assert.equal((await searchPublicPjudJudgments(input, { fetch: fetchMock })).items[0].id, "123");
  docs = Array.from({ length: 10 }, (_, i) => ({ ...docs[0], id: 123 + i }));
  assert.equal((await searchPublicPjudJudgments(input, { fetch: fetchMock })).nextPage, 1);
  assert.equal((await searchPublicPjudJudgments({ ...input, page: 1 }, { fetch: fetchMock })).page, 1);
  assert.equal(sessions, 3, "each page starts an independent session");
  docs = [{ ...docs[0], rol_era_sup_s: "3631-2023" }];
  await assert.rejects(searchPublicPjudJudgments(input, { fetch: fetchMock }), /incompatibles/);
  docs = [{ ...docs[0], rol_era_sup_s: "3630-2022" }];
  await assert.rejects(searchPublicPjudJudgments(input, { fetch: fetchMock }), /incompatibles/);
  docs = [{ ...docs[0], rol_era_sup_s: "3630-2023" }, { ...docs[0], rol_era_sup_s: "3630-2023" }];
  await assert.rejects(searchPublicPjudJudgments(input, { fetch: fetchMock }), /incompatibles/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(searchPublicPjudJudgments(input, { fetch: fetchMock, signal: controller.signal }));
  console.log("PJUD search: page sessions, numeric ROL/year, filter drift rejection, duplicates, limits and cancellation OK");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
