import assert from "node:assert/strict";
import { parseMovimientosFromHtml, parseVerDetalleJuridicaHtml, hasExplicitEmptyHistory } from "./parse-html";
for (const body of ["<script>parent.window.open('../../index.php','_self')</script>", '<SCRIPT> window.location.href = "../index.php";</SCRIPT>']) {
  for (const parse of [parseMovimientosFromHtml, parseVerDetalleJuridicaHtml, hasExplicitEmptyHistory]) assert.throws(() => parse(body), { code: "ojv_session_unavailable" });
}
assert.deepEqual(parseVerDetalleJuridicaHtml('<tr><td>No se han encontrado resultados</td></tr>'), []);
assert.equal(hasExplicitEmptyHistory('<table><tr><th>Fecha</th><th>Trámite</th></tr><tr><td>Sin movimientos</td></tr></table>'), true);
console.log("OJV session redirects never confirm empty history OK");
