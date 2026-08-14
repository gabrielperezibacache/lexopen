import assert from "node:assert/strict";
import {
  parseCausasListFromHtml,
  parseMisCausasFromHtml,
  parseMisCausasLooseFromHtml,
  parseMovimientosFromHtml,
  parseSalaFromHtml,
  extractDocumentoHrefFromRowHtml,
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
    `<td><a href="/x/escrito.docx">archivo</a></td>`
  ),
  "https://oficinajudicialvirtual.pjud.cl/x/escrito.docx"
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

console.log("pjud/parse-html.test.ts OK");
