import assert from "node:assert/strict";
import {
  inferCompetenciaFromTribunal,
  causeRowMatches,
  extractRitsFromText,
  isPlaceholderTribunal,
  parseRitParts,
  pickBestTribunalOption,
  pickCorteForTribunal,
  pickTribunalFromTexts,
  splitRut,
  tribunalLabelsMatch,
  tribunalMatchScore,
  ritLabelsMatch,
  OJV_CONSULTA_URL,
  OJV_HOME,
} from "@/lib/pjud/ojv-dom";
import { parseVerDetalleJuridicaHtml } from "@/lib/pjud/parse-html";

assert.deepEqual(splitRut("12.345.678-9"), { cuerpo: "12345678", dv: "9" });
assert.deepEqual(splitRut("12345678-K"), { cuerpo: "12345678", dv: "K" });
assert.equal(splitRut("bad"), null);
assert.equal(OJV_HOME, "https://oficinajudicialvirtual.pjud.cl/home/");
assert.equal(OJV_CONSULTA_URL, "https://oficinajudicialvirtual.pjud.cl/includes/sesion-consultaunificada.php");

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
assert.deepEqual(parseRitParts("Civil-1234-2024"), { tipo: "CIVIL", numero: "1234", era: "2024" });
assert.deepEqual(parseRitParts("Protección-55-2025"), { tipo: "PROTECCION", numero: "55", era: "2025" });
assert.deepEqual(parseRitParts("Policía Local-7-2025"), { tipo: "POLICIA LOCAL", numero: "7", era: "2025" });
assert.deepEqual(extractRitsFromText("Civil-1234-2024 · Protección-55-2025 · Policía Local-7-2025 · Penal-99-2025"), [
  "CIVIL-1234-2024", "PROTECCION-55-2025", "POLICIA LOCAL-7-2025", "PENAL-99-2025",
]);
assert.deepEqual(extractRitsFromText("Fecha 27-11-2026"), [], "date fragments must not be misread as a RIT");
assert.deepEqual(extractRitsFromText("Notificación resolución C-1234-2024"), ["C-1234-2024"], "ordinary prose before a typed RIT must not consume its prefix");
assert.equal(parseRitParts("27-11-2026"), null, "a full day-month-year date is not a RIT");

assert.equal(inferCompetenciaFromTribunal("1º Juzgado Civil de Santiago"), "3");
assert.equal(inferCompetenciaFromTribunal("Corte de Apelaciones de Santiago"), "2");
assert.equal(inferCompetenciaFromTribunal("C.A. Santiago"), "2");
assert.equal(inferCompetenciaFromTribunal("Juzgado de Cobranza de Santiago"), "6");
assert.equal(inferCompetenciaFromTribunal("1º Juzgado de Familia de Santiago"), "7");
assert.equal(inferCompetenciaFromTribunal("Tribunal de Juicio Oral en lo Penal"), "5");
assert.equal(tribunalLabelsMatch("C.A. Santiago", "Corte de Apelaciones de Santiago"), true);
assert.equal(pickCorteForTribunal([
  { value: "0", label: "Todos" },
  { value: "90", label: "C.A. Santiago" },
  { value: "91", label: "C.A. San Miguel" },
], "3º Juzgado Civil de Santiago")?.value, "90");
assert.equal(pickCorteForTribunal([
  { value: "90", label: "C.A. Santiago" },
  { value: "92", label: "Corte de Apelaciones de Santiago" },
], "3º Juzgado Civil de Santiago"), null, "ambiguous courts must not select the first option");
assert.equal(pickCorteForTribunal([
  { value: "90", label: "C.A. Santiago" },
], "Juzgado Civil de Puente Alto"), null, "court jurisdiction is not inferred from an unmatched locality");

assert.equal(isPlaceholderTribunal("Tribunal no identificado"), true);
assert.equal(isPlaceholderTribunal("Por identificar"), true);
assert.equal(isPlaceholderTribunal("1º Juzgado Civil de Santiago"), false);
assert.equal(pickTribunalFromTexts(["1º J.L.T. de Santiago"]), "1º J.L.T. de Santiago");
assert.equal(pickTribunalFromTexts(["J.G. de Iquique"]), "J.G. de Iquique");
assert.equal(pickTribunalFromTexts(["T.O.P. de Santiago"]), "T.O.P. de Santiago");
assert.equal(pickTribunalFromTexts(["Juz. de Letras de Santiago"]), "Juz. de Letras de Santiago");
assert.equal(pickTribunalFromTexts(["C.A. de Iquique"]), "C.A. de Iquique");
assert.equal(pickTribunalFromTexts(["Corte de Apelaciones de Iquique contra Rebolledo", "Corte Suprema"]), "Corte Suprema",
  "a caption that begins with a canonical court name is still not a tribunal cell");
assert.equal(
  pickTribunalFromTexts(["C-1-2024", "1º Juzgado de Familia de Santiago", "Tramitación"]),
  "1º Juzgado de Familia de Santiago"
);
assert.equal(
  pickTribunalFromTexts([
    "38220-2025",
    "REBOLLEDO DIAZ MARIA FERNANDA CONTRA SALA DE LA ILUSTRÍSIMA CORTE DE APELACIONES DE IQUIQUE",
    "Corte Suprema",
  ]),
  "Corte Suprema",
  "a canonical Supreme Court cell outranks the court name embedded in a case caption"
);
assert.equal(
  pickTribunalFromTexts(["18390-2025", "(Penal) Contienda de Competencia", "Corte Suprema"]),
  "Corte Suprema",
  "a resource type must not be mistaken for the tribunal"
);
assert.equal(
  tribunalLabelsMatch(
    "1º Juzgado Civil de Santiago",
    "1er Juzgado Civil de Santiago"
  ),
  true
);
assert.ok(
  tribunalMatchScore(
    "15º Juzgado Civil de Santiago",
    "15 Juzgado Civil de Santiago"
  ) >= 0.72
);
const best = pickBestTribunalOption(
  [
    { value: "1", label: "Seleccione Tribunal" },
    { value: "10", label: "10º Juzgado Civil de Santiago" },
    { value: "15", label: "15º Juzgado Civil de Santiago" },
  ],
  "15º Juzgado Civil de Santiago"
);
assert.equal(best?.value, "15");

assert.equal(tribunalLabelsMatch("2º Juzgado Civil de Santiago", "1º Juzgado Civil de Santiago"), false);
assert.equal(tribunalLabelsMatch("11º Juzgado Civil de Santiago", "1º Juzgado Civil de Santiago"), false);
assert.equal(tribunalLabelsMatch("1º Juzgado de Familia de Santiago", "1º Juzgado Civil de Santiago"), false);
assert.equal(tribunalLabelsMatch("1º Juzgado Civil de Valparaíso", "1º Juzgado Civil de Santiago"), false);
assert.equal(pickBestTribunalOption([
  { value: "1", label: "1º Juzgado Civil de Santiago" },
  { value: "2", label: "2º Juzgado Civil de Santiago" },
], "Juzgado Civil de Santiago"), null, "an incomplete label must not select the first of tied tribunals");

const wanted = { rit: "C-1-2024", tribunal: "1º Juzgado Civil de Santiago" };
assert.deepEqual(extractRitsFromText("RIT C-1-2024 · C-11-2024 · F-1-2024"), ["C-1-2024", "C-11-2024", "F-1-2024"]);
assert.equal(ritLabelsMatch("C-000001-2024", wanted.rit), true);
assert.equal(ritLabelsMatch("C-11-2024", wanted.rit), false);
assert.equal(ritLabelsMatch("F-1-2024", wanted.rit), false);
assert.equal(ritLabelsMatch("1-2024", wanted.rit), false, "a missing letter is not a confirmed identity");
assert.equal(causeRowMatches(["C-1-2024", wanted.tribunal], wanted), true);
assert.equal(causeRowMatches(
  ["18390-2025", "(Penal) Contienda de Competencia", "Parte A CONTRA Sala de la Corte de Apelaciones de Iquique", "Corte Suprema"],
  { rit: "18390-2025", tribunal: "Corte Suprema" }
), true, "the exact Supreme Court column confirms this row despite unrelated text cells");
assert.equal(causeRowMatches(["C-11-2024", wanted.tribunal], wanted), false);
assert.equal(causeRowMatches(["F-1-2024", wanted.tribunal], wanted), false);
assert.equal(causeRowMatches(["C-1-2024", "2º Juzgado Civil de Santiago"], wanted), false);
assert.equal(causeRowMatches(["C-1-2024", wanted.tribunal], { ...wanted, tribunal: "Juzgado Civil de Santiago" }), false, "missing ordinal does not confirm a numbered tribunal");
assert.equal(causeRowMatches(["C-1-2024", "Tribunal no identificado"], wanted), false);
assert.equal(causeRowMatches(["C-1-2024", "C-2-2024", wanted.tribunal], wanted), false, "a container of multiple cases is not a row");

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
assert.equal(rows[0].ruc, null, "a litigant RUT must not be stored as the case RUC");

console.log("pjud/ojv-dom.test.ts OK");
