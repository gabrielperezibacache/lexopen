import assert from "node:assert/strict";
import {
  parseCausasListFromHtml,
  parseMisCausasFromHtml,
  parseMisCausasLooseFromHtml,
  parseMovimientosFromHtml,
  parseSalaFromHtml,
  extractDocumentoHrefFromRowHtml,
  hasExplicitEmptyHistory,
} from "@/lib/pjud/parse-html";

const html = `
<table>
  <tr><th>Folio</th><th>Fecha</th><th>Trámite</th><th>Documento</th></tr>
  <tr><td>1</td><td>12/08/2026</td><td>Proveído: téngase por presentada demanda</td>
    <td><a href="/documentos/abc123.pdf">Descargar PDF</a></td></tr>
  <tr><td>5</td><td>2026-08-10</td><td>Notificación receptor: cédula a demandado</td>
    <td><a href="https://oficinajudicialvirtual.pjud.cl/files/cedula.pdf">Ver documento</a></td></tr>
  <tr><td>9</td><td>sin-fecha</td><td>Escrito que no debe aparecer</td><td></td></tr>
</table>
<p>Sala: 3 Civil</p>
`;

const movs = parseMovimientosFromHtml(html);
assert.equal(movs.length, 2);
assert.equal(movs[0].folio, "1");
assert.equal(movs[0].fecha.toISOString().slice(0, 10), "2026-08-12");
assert.equal(
  movs[0].documentoRef,
  "https://oficinajudicialvirtual.pjud.cl/documentos/abc123.pdf"
);
assert.equal(movs[1].esReceptor, true);
assert.equal(
  movs[1].documentoRef,
  "https://oficinajudicialvirtual.pjud.cl/files/cedula.pdf"
);
assert.ok(!movs.some((m) => /no debe aparecer/i.test(m.titulo)));
assert.equal(parseSalaFromHtml(html), "3 Civil");

assert.equal(
  extractDocumentoHrefFromRowHtml(
    `<td><a href="#" onclick="window.open('/documentos/xyz.pdf')">PDF</a></td>`
  ),
  "https://oficinajudicialvirtual.pjud.cl/documentos/xyz.pdf"
);

const listHtml = `
<table>
  <tr><td>RIT</td><td>Tribunal</td><td>Carátula</td></tr>
  <tr><td>C-100-2024</td><td>1º Juzgado Civil de Santiago</td><td>Pérez / Gómez</td></tr>
  <tr><td>C-100-2024</td><td>1º Juzgado Civil de Santiago</td><td>duplicado</td></tr>
  <tr><td>99-2024</td><td>sin tribunal explícito</td><td>omitida</td></tr>
</table>
`;
const list = parseCausasListFromHtml(listHtml);
assert.equal(list.length, 2);
assert.equal(list[0].rit, "C-100-2024");
assert.equal(list[1].rit, "99-2024");
assert.equal(list[1].tribunal, "Tribunal no identificado");

const looseHtml = `
<div class="card">
  <h3>C-55-2023</h3>
  <p>1º Juzgado de Familia de Santiago · Tramitación</p>
  <p>RUC 00-12345678-9</p>
</div>
`;
const loose = parseMisCausasLooseFromHtml(looseHtml);
assert.ok(loose.some((x) => x.rit === "C-55-2023"));
assert.ok(loose.some((x) => /Familia/i.test(x.tribunal)));

const mergedHtml = `
<table id="verDetalleJuridica">
  <tr><td><a>ver</a></td><td>C-1-2024</td><td>1º Juzgado Civil de Santiago</td><td></td><td>A / B</td><td>01/01/2024</td><td>Tramitación</td></tr>
</table>
<div class="card"><h3>F-9-2020</h3><p>2º Juzgado de Familia de Santiago · Terminada</p></div>
`;
const merged = parseMisCausasFromHtml(mergedHtml);
assert.ok(merged.some((x) => x.rit === "C-1-2024"));
assert.ok(
  merged.some((x) => x.rit === "F-9-2020"),
  "loose rows must survive beside verDetalle"
);
assert.equal(merged.length, 2, "loose extraction must not duplicate table rows or concatenate adjacent tribunals");

const separateCards = parseMisCausasFromHtml(`
<div class="panel">
  <div class="card"><h3>C-1-2024</h3><p>1º Juzgado Civil de Santiago · Tramitación</p><p>RUT 12.345.678-5</p></div>
  <div class="card"><h3>C-11-2024</h3><p>2º Juzgado Civil de Valpara&iacute;so · Terminada</p><p>RUC 00-12345678-9</p></div>
</div>
<script>const stale = 'F-9-2020 3º Juzgado de Familia de Santiago';</script>
<div class="card" hidden><h3>C-99-2024</h3><p>Juzgado Civil de Talca</p></div>
`);
assert.equal(separateCards.length, 2);
assert.deepEqual(separateCards.map((row) => row.tribunal), ["1º Juzgado Civil de Santiago", "2º Juzgado Civil de Valparaíso"]);
assert.equal(separateCards[0].ruc, null);
assert.equal(separateCards[1].ruc, "00-12345678-9");
assert.deepEqual(parseMisCausasFromHtml(`<script>"C-10-2024 Juzgado Civil de Santiago"</script>`), []);
assert.deepEqual(parseMisCausasFromHtml(`<div style="display:none"><table><tr><td>C-99-2024</td><td>Juzgado Civil de Talca</td></tr></table><div class="card"><h3>C-99-2024</h3><p>Juzgado Civil de Talca</p></div></div>`), [], "hidden tables and cards from a previous result are ignored");
assert.deepEqual(parseMisCausasFromHtml(`<section class="tab-pane"><table><tr><td>C-99-2024</td><td>Juzgado Civil de Talca</td></tr></table></section>`), [], "inactive tab data is not a current result");

assert.equal(hasExplicitEmptyHistory(`<table><tr><th>Fecha</th><th>Trámite</th></tr><tr><td colspan="2">Ningún dato disponible en esta tabla</td></tr></table>`), true);
assert.equal(hasExplicitEmptyHistory(`<p>Sin registros</p>`), false, "an empty DOM is not a confirmed empty history");
assert.equal(hasExplicitEmptyHistory(`<table><tr><th>Fecha</th><th>Tribunal</th></tr><tr><td>Sin registros</td></tr></table>`), false, "a case listing is not a history");

const movsLongDate = parseMovimientosFromHtml(`
<table class="table-titulos">
  <tr><th>Folio</th><th>Fecha</th><th>Trámite</th></tr>
  <tr><td>2</td><td>13 de agosto de 2025</td><td>Resolución: se tiene por presentada</td></tr>
</table>
`);
assert.equal(movsLongDate.length, 1);
assert.equal(movsLongDate[0].fecha.toISOString().slice(0, 10), "2025-08-13");
assert.equal(movsLongDate[0].titulo, "Resolución: se tiene por presentada");

console.log("pjud/parse-html.test.ts OK");
