import assert from "node:assert/strict";
import {
  parseCausasListFromHtml,
  parseMovimientosFromHtml,
  parseSalaFromHtml,
} from "@/lib/pjud/parse-html";

const html = `
<table>
  <tr><th>Folio</th><th>Fecha</th><th>Trámite</th></tr>
  <tr><td>1</td><td>12/08/2026</td><td>Proveído: téngase por presentada demanda</td></tr>
  <tr><td>5</td><td>2026-08-10</td><td>Notificación receptor: cédula a demandado</td></tr>
  <tr><td>9</td><td>sin-fecha</td><td>Escrito que no debe aparecer</td></tr>
</table>
<p>Sala: 3 Civil</p>
`;

const movs = parseMovimientosFromHtml(html);
assert.equal(movs.length, 2);
assert.equal(movs[0].folio, "1");
assert.equal(movs[0].fecha.toISOString().slice(0, 10), "2026-08-12");
assert.equal(movs[1].esReceptor, true);
assert.ok(!movs.some((m) => /no debe aparecer/i.test(m.titulo)));
assert.equal(parseSalaFromHtml(html), "3 Civil");

const listHtml = `
<table>
  <tr><td>RIT</td><td>Tribunal</td><td>Carátula</td></tr>
  <tr><td>C-100-2024</td><td>1º Juzgado Civil de Santiago</td><td>Pérez / Gómez</td></tr>
  <tr><td>C-100-2024</td><td>1º Juzgado Civil de Santiago</td><td>duplicado</td></tr>
  <tr><td>99-2024</td><td>sin tribunal explícito</td><td>omitida</td></tr>
</table>
`;
const list = parseCausasListFromHtml(listHtml);
assert.equal(list.length, 1);
assert.equal(list[0].rit, "C-100-2024");

console.log("pjud/parse-html.test.ts OK");
