import assert from "node:assert/strict";
import {
  inferCompetenciaFromTribunal,
  parseRitParts,
  splitRut,
  tribunalLabelsMatch,
} from "@/lib/pjud/ojv-dom";
import { parseVerDetalleJuridicaHtml } from "@/lib/pjud/parse-html";

assert.deepEqual(splitRut("12.345.678-9"), { cuerpo: "12345678", dv: "9" });
assert.deepEqual(splitRut("12345678-K"), { cuerpo: "12345678", dv: "K" });
assert.equal(splitRut("bad"), null);

assert.deepEqual(parseRitParts("C-100-2024"), {
  tipo: "C",
  numero: "100",
  era: "2024",
});
assert.deepEqual(parseRitParts("100-2024"), {
  tipo: null,
  numero: "100",
  era: "2024",
});

assert.equal(inferCompetenciaFromTribunal("1º Juzgado Civil de Santiago"), "3");
assert.equal(inferCompetenciaFromTribunal("Corte de Apelaciones de Santiago"), "2");
assert.equal(inferCompetenciaFromTribunal("Juzgado de Cobranza de Santiago"), "6");
assert.equal(inferCompetenciaFromTribunal("Tribunal de Juicio Oral en lo Penal"), "5");

assert.equal(
  tribunalLabelsMatch(
    "1º Juzgado Civil de Santiago",
    "1er Juzgado Civil de Santiago"
  ),
  true
);

const listHtml = `
<table id="verDetalleJuridica">
  <tr><td><a onclick="x()">ver</a></td><td>C-100-2024</td><td>1º Juzgado Civil de Santiago</td><td>12.345.678-9</td><td>Pérez / Gómez</td><td>12/08/2026</td><td>Tramitación</td></tr>
  <tr><td colspan="7"><nav class="pagination">1</nav></td></tr>
</table>
`;
const rows = parseVerDetalleJuridicaHtml(listHtml);
assert.equal(rows.length, 1);
assert.equal(rows[0].rit, "C-100-2024");
assert.match(rows[0].tribunal, /Civil/);
assert.equal(rows[0].fecha, "2026-08-12");

console.log("pjud/ojv-dom.test.ts OK");
