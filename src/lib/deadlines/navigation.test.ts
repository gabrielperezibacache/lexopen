import assert from "node:assert/strict";
import { deadlineHref, deadlineOrigin } from "./navigation";

const id = "plazo-fixture", causeId = "causa-fixture";
assert.equal(deadlineHref(id), "/plazos/plazo-fixture");
for (const source of [
  `/causas/${causeId}#plazo-${id}`, `/causas/${causeId}#actividad`, `/pjud/${causeId}#plazos`,
  `/causas/${causeId}?mesa=mesa1&volver=%2Fmis-causas%3Fq%3Dpago%23causa-causa-fixture#plazo-${id}`,
  `/calendario?vista=semana&semana=2026-11-02&tipo=plazo#tablero-plazo-${id}`,
  `/calendario?vista=agenda&ym=2026-11&tipo=plazo#movil-plazo-${id}`,
  `/plazos?mes=2026-11&vista=mis-vencidos&after=page2&causaId=${causeId}#plazo-${id}`,
]) {
  const parsed = new URL(deadlineHref(id, source), "https://lexopen.test");
  assert.equal(parsed.pathname, "/plazos/plazo-fixture");
  assert.equal(deadlineOrigin(parsed.searchParams.get("volver"), id, causeId), source);
}
for (const source of [null, [], "//otro.invalid", "https://otro.invalid/plazos", "/\\otro.invalid/plazos", "/api/plazos", "/causas/ajena#plazos"]) {
  assert.equal(deadlineOrigin(source, id, causeId), null);
}
assert.equal(deadlineOrigin("/calendario?vista=semana&semana=2026-02-31&nuevo=1#ajena", id, null), "/calendario?vista=semana");
assert.equal(deadlineOrigin("/plazos?causaId=ajena&vista=proximos#plazo-otro", id, causeId), "/plazos?vista=proximos");
assert.equal(deadlineOrigin("/plazos?mes=2026-11#plazo-plazo-fixture", id, null), "/plazos?mes=2026-11#plazo-plazo-fixture");
console.log("Exact deadline links keep authorized origin, filters, cursor and activity.");
