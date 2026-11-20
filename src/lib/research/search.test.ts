import assert from "node:assert/strict";
import { researchWorkspaceHref, researchWorkspaceView } from "./workspace-navigation";
import { normalizeResearchText, rankResearchText, researchQuerySchema, researchTerms, RESEARCH_LIMITS } from "./search";
assert.deepEqual(researchTerms("¿Cuál es la prescripción del contrato y de la prescripción?"), ["prescripcion", "contrato"]);
assert.equal(normalizeResearchText("Órgano: DIRECCIÓN"), "organo: direccion");
assert.deepEqual(researchTerms("artículo 7; 20.000"), ["articulo", "7", "20", "000"]);
assert.equal(rankResearchText("Prescripción del contrato", "Otro", ["prescripcion", "contrato"]).score, 20);
assert.equal(rankResearchText("Nada relacionado", "Contrato", ["prescripcion", "contrato"]).score, 3);
assert.throws(() => researchTerms("de la y en"), /palabras concretas/);
assert.throws(() => researchTerms(Array.from({length:RESEARCH_LIMITS.queryTerms+1},(_,i)=>`termino${i}`).join(" ")), /hasta/);
assert.equal(researchQuerySchema.safeParse({query:"contrato",documentIds:Array.from({length:201},(_,i)=>`${i}`)}).success,false);
assert.equal(researchQuerySchema.safeParse({query:"contrato",limit:21}).success,false);
assert.equal(researchQuerySchema.safeParse({query:"contrato",sourceKinds:["invented"]}).success,false);
assert.equal(researchQuerySchema.safeParse({query:"contrato",userId:"another user"}).success,false);
assert.deepEqual(researchTerms("contrato'; DROP TABLE User; --"), ["contrato", "drop", "table", "user"]);
for (const view of [undefined, "", "../sources", ["sources"]]) assert.equal(researchWorkspaceView(view), "query");
assert.equal(researchWorkspaceView("sources"), "sources");
assert.equal(researchWorkspaceView("history"), "history");
for (const target of ["unified", "sources", "history"] as const) {
  const href = new URL(researchWorkspaceHref(target, { q: "fallo & recurso", materia: "civil", investigacion: "saved-query" }), "https://local.invalid");
  assert.equal(href.pathname, "/jurisprudencia");
  assert.equal(href.searchParams.get("q"), "fallo & recurso");
  assert.equal(href.searchParams.get("investigacion"), "saved-query");
  assert.equal(href.searchParams.get("vista"), target === "history" ? "history" : "sources");
  assert.equal(href.hash, target === "unified" ? "#unificado" : target === "sources" ? "#fuentes-estudio" : "#investigaciones");
}
console.log("research search OK: accents, dedupe, bounded terms and scope, literal ranking, unknown scope rejected");
