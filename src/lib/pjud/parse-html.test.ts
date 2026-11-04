import assert from "node:assert/strict";
import {
  parseCausasListFromHtml,
  parseMisCausasFromHtml,
  parseMisCausasLooseFromHtml,
  parseMovimientosFromHtml,
  parseSalaFromHtml,
  extractDocumentoHrefFromRowHtml,
  hasExplicitEmptyHistory,
  parseVerDetalleJuridicaHtml,
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

// Observed Civil table structure, with fictitious parties and movements.
const civilListing = `<table id="dtaTableDetalle">
<thead><tr><th></th><th>Rol</th><th>Fecha</th><th>Caratulado</th><th>Tribunal</th></tr></thead>
<tbody><tr><td><a href="#" title="Detalle de la causa"><i class="fa fa-search"></i></a></td>
<td>C-100-2024</td><td>12/08/2024</td><td>Entidad Uno / Entidad Dos</td><td>3º Juzgado Civil de Santiago</td></tr></tbody>
</table>`;
const civilIdentities = parseVerDetalleJuridicaHtml(civilListing);
assert.equal(civilIdentities.length, 1);
assert.equal(civilIdentities[0].rit, "C-100-2024");
assert.equal(civilIdentities[0].tribunal, "3º Juzgado Civil de Santiago");
assert.equal(civilIdentities[0].caratula, "Entidad Uno / Entidad Dos");
assert.equal(civilIdentities[0].fecha, "2024-08-12");
assert.equal(parseMisCausasFromHtml(civilListing).length, 1);

const supremaListing = `<table id="dtaTableDetalleMisCauSup"><thead><tr><th></th><th>Rol</th><th>Caratulado</th><th>Fecha Ingreso</th><th>Estado Causa</th><th>Corte</th><th>Institución</th></tr></thead>
<tbody><tr><td><a title="Detalle de la causa"></a></td><td>20-2024</td><td>Entidad Uno / Entidad Dos</td><td>12/08/2024</td><td>Tramitación</td><td>Corte Suprema</td><td>Institución ficticia</td></tr></tbody></table>`;
const supremaIdentities = parseMisCausasFromHtml(supremaListing);
assert.equal(supremaIdentities.length, 1);
assert.equal(supremaIdentities[0].rit, "20-2024");
assert.equal(supremaIdentities[0].tribunal, "Corte Suprema");
assert.equal(supremaIdentities[0].caratula, "Entidad Uno / Entidad Dos");

const civilHeaders = `<tr><th>Folio</th><th>Doc.</th><th>Anexo</th><th>Etapa</th><th>Trámite</th><th>Desc.Trámite</th><th>Fec.Trámite</th><th>Foja</th><th>Georref.</th></tr>`;
const civilHistory = `<div class="modal in" id="modalDetalleCivil">
<div id="historiaCiv" class="tab-pane active"><table><thead>${civilHeaders}</thead><tbody>
<tr><td>124</td><td><a href="/documentos/fixture.pdf">PDF</a></td><td></td><td>Tramitación</td><td>Escrito</td><td>Demanda</td><td>12/08/2024</td><td>0</td><td></td></tr>
<tr><td>123</td><td></td><td></td><td>Prueba</td><td>Resolución</td><td>Recibe causa a prueba</td><td>13/08/2024</td><td>0</td><td></td></tr>
<tr><td>122</td><td></td><td></td><td>Tramitación</td><td>Resolución</td><td></td><td>14/08/2024</td><td>0</td><td></td></tr>
</tbody></table></div>
<div class="tab-pane" id="litigantesCiv"><table><tr><td>1</td><td>15/08/2024</td><td>Litigante que no es un movimiento</td></tr></table></div>
<div class="tab-pane" id="notificacionesCiv"><table><tr><td>2</td><td>16/08/2024</td><td>Notificación oculta que no debe mezclarse</td></tr></table></div>
<table><tr><th>Rol Corte</th><th>Descripción del Trámite</th><th>Fecha Trámite</th></tr>
<tr><td>321-2024</td><td>Remisión exterior que no es historia civil</td><td>17/08/2024</td></tr></table>
<table><tr><th>Fecha</th><th>Trámite</th></tr><tr><td>Sin movimientos</td></tr></table>
</div>`;
const parsedCivil = parseMovimientosFromHtml(civilHistory);
assert.deepEqual(parsedCivil.map((row) => row.folio), ["124", "123", "122"]);
assert.deepEqual(parsedCivil.map((row) => row.titulo), ["Demanda", "Recibe causa a prueba", "Resolución"]);
assert.equal(parsedCivil[0].fecha.toISOString().slice(0, 10), "2024-08-12");
assert.equal(parsedCivil[0].tramite, "Escrito");
assert.equal(parsedCivil[0].etapa, "Tramitación");
assert.equal(parsedCivil[1].etapa, "Prueba");
assert.equal(parsedCivil[0].cuaderno, null, "the history panel does not establish its selected cuaderno");
assert.equal(parsedCivil[0].documentoRef, "https://oficinajudicialvirtual.pjud.cl/documentos/fixture.pdf");
assert.equal(hasExplicitEmptyHistory(civilHistory), false, "an empty table outside the active Civil history is not evidence about that history");
assert.equal(hasExplicitEmptyHistory(`<div id="historiaCiv" class="tab-pane active"><table>${civilHeaders}<tr><td colspan="9">Ningún dato disponible en esta tabla</td></tr></table></div>`), true);

const civilDateFixture = (date: string, description = "Actuación ficticia", extra = "") => `<div id="historiaCiv" class="tab-pane active"><table>${civilHeaders}
<tr><td>7</td><td>${extra}</td><td></td><td>Tramitación</td><td>Resolución</td><td>${description}</td><td>${date}</td><td>0</td><td></td></tr></table></div>`;
const pairedCivilDate = parseMovimientosFromHtml(civilDateFixture("04/03/2024 (01/03/2024)"));
assert.equal(pairedCivilDate.length, 1);
assert.equal(pairedCivilDate[0].fecha.toISOString().slice(0, 10), "2024-03-04");
assert.match(pairedCivilDate[0].detalle || "", /04\/03\/2024 \(01\/03\/2024\)/, "the secondary date remains source text without an inferred meaning");
assert.equal(parseMovimientosFromHtml(civilDateFixture("32/03/2024 (01/03/2024)")).length, 0, "an invalid primary date cannot borrow the parenthetical date");
assert.equal(parseMovimientosFromHtml(civilDateFixture("sin fecha (01/03/2024)")).length, 0);
assert.equal(parseMovimientosFromHtml(civilDateFixture("04/03/2024 (01/03/2024) texto adicional")).length, 0);
assert.equal(parseMovimientosFromHtml(civilDateFixture("2024-03-04 texto adicional")).length, 0);
assert.equal(parseMovimientosFromHtml(civilDateFixture("", "Actuación ficticia", "01/03/2024")).length, 0, "a known empty date column cannot borrow another cell's date");
assert.equal(parseMovimientosFromHtml(civilDateFixture("32/03/2024", "Actuación ficticia", "01/03/2024")).length, 0);
assert.equal(parseMovimientosFromHtml(civilDateFixture("04/03/2024", "NHL"))[0].titulo, "Resolución", "a short description falls back to the usable Trámite column");
assert.equal(parseMovimientosFromHtml(`<table><tr><td>7</td><td>04/03/2024 (01/03/2024)</td><td>Actuación ficticia</td></tr></table>`).length, 0, "paired dates require an identified date column");

// OJV can hide an attachment cell independently of its column heading. A hidden
// cell must not shift Fec. Trámite to Foja or disclose an invisible document.
const responsiveHistory = civilDateFixture("04/03/2024", "Actuación visible",
  '<a href="/documentos/INVISIBLE_SOURCE.pdf">INVISIBLE_SOURCE</a>');
for (const attribute of ['aria-hidden="true"', 'style="display:none"', "hidden"]) {
  const hiddenBody = responsiveHistory.replace("<td><a", `<td ${attribute}><a`);
  const hiddenHeader = responsiveHistory.replace("<th>Doc.</th>", `<th ${attribute}>Doc.</th>`);
  for (const html of [hiddenBody, hiddenHeader, hiddenBody.replace("<th>Doc.</th>", `<th ${attribute}>Doc.</th>`)]) {
    const rows = parseMovimientosFromHtml(html);
    assert.equal(rows.length, 1, "hiding an unrelated cell must preserve the known date column");
    assert.equal(rows[0].fecha.toISOString().slice(0, 10), "2024-03-04");
    assert.equal(rows[0].titulo, "Actuación visible");
  }
  const bodyRow = parseMovimientosFromHtml(hiddenBody)[0];
  assert.equal(bodyRow.documentoRef, null, "invisible attachment links must not become downloads");
  assert.doesNotMatch(bodyRow.detalle || "", /INVISIBLE_SOURCE/);
}
assert.equal(parseMovimientosFromHtml(responsiveHistory.replace("<td>04/03/2024</td>", '<td hidden>04/03/2024</td>')).length, 0,
  "a hidden date must remain unavailable rather than borrowing a different cell");
assert.equal(parseMovimientosFromHtml(responsiveHistory.replace("<table>", '<table aria-hidden="true">')).length, 0);
assert.equal(parseMovimientosFromHtml(responsiveHistory.replace("<tr><td>7", '<tr hidden><td>7')).length, 0);
assert.equal(parseMovimientosFromHtml(responsiveHistory.replace('class="tab-pane active"', 'class="tab-pane"')).length, 0,
  "preserving cell positions must not retain inactive history panes");

// The observed Civil table includes an obsolete commented-out td after Trámite.
// Comments must disappear before the row/cell expressions inspect serialized HTML.
const commentedCellHistory = civilDateFixture("04/03/2024", "Actuación visible ficticia")
  .replace("<td>Resolución</td>", '<td>Resolución</td><!-- <td><a href="/documentos/COMMENT_ONLY.pdf">Columna antigua ficticia</a></td> -->');
const parsedCommentedCell = parseMovimientosFromHtml(commentedCellHistory);
assert.equal(parsedCommentedCell.length, 1, "a commented obsolete cell cannot shift the real date column");
assert.equal(parsedCommentedCell[0].fecha.toISOString().slice(0, 10), "2024-03-04");
assert.equal(parsedCommentedCell[0].titulo, "Actuación visible ficticia");
assert.equal(parsedCommentedCell[0].documentoRef, null, "a download that exists only inside a comment must not be attached");
assert.doesNotMatch(parsedCommentedCell[0].detalle || "", /Columna antigua|COMMENT_ONLY/);
assert.equal(parseMovimientosFromHtml(commentedCellHistory.replace("<th>Anexo</th>", "<th>Anexo</th><!-- <th>Cabecera obsoleta</th> -->")).length, 1);

const commentedGhostRows = '<!-- <table><tr><th>Fecha</th><th>Trámite</th></tr><tr><td>01/01/2026</td><td>Movimiento inexistente ficticio</td></tr></table> -->';
assert.equal(parseMovimientosFromHtml(commentedGhostRows).length, 0, "fully commented tables and rows are never movements");
assert.equal(parseMovimientosFromHtml(commentedCellHistory.replace("</table>", '<!-- <tr><td>99</td><td></td><td></td><td>Etapa</td><td>Resolución</td><td>Fila inexistente ficticia</td><td>01/01/2026</td><td>0</td><td></td></tr> --></table>')).length, 1);
assert.equal(parseMovimientosFromHtml(civilDateFixture("04/03/2024", "Actuación visible ficticia", '<!-- <a href="/documentos/COMMENT_ONLY.pdf">PDF</a> -->'))[0].documentoRef, null);

const contextual = parseMovimientosFromHtml(civilDateFixture("04/03/2024", "Actuación verificada"), { cuaderno: "Principal" });
assert.equal(contextual[0].cuaderno, "Principal");
assert.match(contextual[0].externalId, /^scrape:v2:/);
assert.throws(() => parseMovimientosFromHtml('<table><tr><th>Folio</th><th>Fecha</th><th>Cuaderno</th><th>Trámite</th></tr><tr><td>1</td><td>04/03/2024</td><td>Principal</td><td>Actuación ficticia</td></tr></table>', { cuaderno: "1.1 - Incidente" }), /no corresponde/, "an explicit contradictory cuaderno cannot be relabelled");
let incompleteRows = 0;
parseMovimientosFromHtml(civilDateFixture("32/03/2024", "Actuación ficticia"), { cuaderno: "Principal", onIncompleteRow: () => { incompleteRows++; } });
assert.equal(incompleteRows, 1, "coverage can flag an unparseable dated column without copying its cell text");

console.log("pjud/parse-html.test.ts OK");
