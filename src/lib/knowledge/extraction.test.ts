import assert from "node:assert/strict";
import { analyzeEvidenceFragment, detectPotentialContradictions, extractFactAmounts, extractFactProposals, KNOWLEDGE_EXTRACTION_LIMITS, parseFactTemporal, type ComparableFact } from "./extraction";

assert.deepEqual(parseFactTemporal("El contrato fue firmado el 12 de mayo de 2025."), { literal: "12 de mayo de 2025", start: "2025-05-12", end: "2025-05-12", precision: "day", inferred: false, warning: null });
assert.equal(parseFactTemporal("La audiencia se celebró el 2024-02-29.").start, "2024-02-29");
assert.equal(parseFactTemporal("La audiencia se celebró el 2025-02-29.").start, null);
assert.equal(parseFactTemporal("Se recibió el 31 de abril de 2025.").precision, "unknown");
assert.deepEqual(parseFactTemporal("Se pagó durante febrero de 2024."), { literal: "febrero de 2024", start: "2024-02-01", end: "2024-02-29", precision: "month", inferred: false, warning: null });
assert.equal(parseFactTemporal("Se pagó en el año 2025.").precision, "year");
assert.equal(parseFactTemporal("Se pagó en 2025.").start, "2025-01-01");
assert.equal(parseFactTemporal("2025").end, "2025-12-31");
assert.equal(parseFactTemporal("Contrato 2025, saldo pendiente.").start, null, "An identifier is not an event year");
assert.equal(parseFactTemporal("El documento fue cargado ayer.").start, null);
assert.match(parseFactTemporal("La audiencia se celebró el 03/04/2025.").warning!, /más de un orden/);
assert.equal(parseFactTemporal("La audiencia se celebró el 03/04/2025.").precision, "ambiguous");
assert.equal(parseFactTemporal("La audiencia se celebró el 13/04/2025.").start, "2025-04-13");
assert.equal(parseFactTemporal("La audiencia se celebró el 04/13/2025.").start, "2025-04-13");
assert.equal(parseFactTemporal("La audiencia se celebró el 35/04/2025.").start, null);
assert.deepEqual(parseFactTemporal("El pago ocurrió entre el 12 y el 14 de mayo de 2025."), { literal: "entre el 12 y el 14 de mayo de 2025", start: "2025-05-12", end: "2025-05-14", precision: "range", inferred: false, warning: null });
assert.equal(parseFactTemporal("El pago ocurrió del 12 al 14 de mayo de 2025.").end, "2025-05-14");
assert.equal(parseFactTemporal("Se entregó entre el 12 de mayo de 2025 y el 14 de junio de 2025.").precision, "range");
assert.equal(parseFactTemporal("Se entregó entre mayo de 2025 y julio de 2025.").end, "2025-07-31");
assert.equal(parseFactTemporal("Se entregó entre el 30 y el 12 de mayo de 2025.").start, null);
assert.equal(parseFactTemporal("Se firmó el 12 de mayo de 2025 y se pagó el 14 de mayo de 2025.").precision, "ambiguous");
assert.equal(parseFactTemporal("Se pagó antes del 12 de mayo de 2025.").start, null);
assert.equal(parseFactTemporal("Se pagó aproximadamente el 12 de mayo de 2025.").start, null);

assert.deepEqual(extractFactAmounts("Se pagaron CLP 25.000."), [{ literal: "CLP 25.000", currency: "CLP", value: "25000", qualified: false }]);
assert.equal(extractFactAmounts("Se pagaron 25.000 pesos chilenos.")[0].value, "25000");
assert.equal(extractFactAmounts("Se pagaron USD 1,234.56.")[0].value, "1234.56");
assert.equal(extractFactAmounts("Se pagaron EUR 1.234,56.")[0].value, "1234.56");
assert.equal(extractFactAmounts("Se pagaron UF 1,2500.")[0].value, "1.25");
assert.equal(extractFactAmounts("Se pagaron USD 1,234.")[0].value, null, "A single three-digit separator can be decimal or grouping");
assert.equal(extractFactAmounts("Se pagaron $25.000.")[0].currency, "unknown-dollar");
assert.equal(extractFactAmounts("Se pagaron 25000 pesos.")[0].currency, "unknown-peso");
assert.equal(extractFactAmounts("Se pagaron US$25.00.")[0].currency, "USD");
assert.equal(extractFactAmounts("Se pagaron aproximadamente CLP 25000.")[0].qualified, true);
assert.equal(extractFactAmounts("Se pagaron entre CLP 25000 y CLP 30000.").length, 2);
assert.equal(extractFactAmounts("La audiencia fue el 12/04/2025, expediente 25000.").length, 0);
assert.equal(extractFactAmounts("El saldo fue -25000 pesos chilenos.")[0].value, "-25000");
assert.equal(extractFactAmounts("El saldo fue CLP −25.000.")[0].value, "-25000");
assert.equal(extractFactAmounts("El saldo fue CLP +25.000.")[0].value, "25000");
assert.equal(extractFactAmounts("El saldo fue - 25000 pesos chilenos.")[0].qualified, true);
assert.equal(extractFactAmounts("El saldo fue (25000 pesos chilenos).")[0].qualified, true);
assert.equal(extractFactAmounts("El saldo fue CLP 100 millones.")[0].qualified, true);
assert.equal(extractFactAmounts("El saldo fue CLP 100 mil.")[0].qualified, true);

const text = "El contrato fue firmado el 12 de mayo de 2025. La audiencia se celebró el 03/04/2025. Se pagaron CLP 25.000.";
const proposals = extractFactProposals({ id: "fragment-a", text });
assert.equal(proposals.length, 3);
assert.equal(proposals[0].temporal.start, "2025-05-12");
assert.equal(proposals[1].temporal.precision, "ambiguous");
assert.equal(proposals[2].temporal.start, null);
for (const proposal of proposals) {
  assert.ok(text.includes(proposal.quote)); assert.equal(proposal.statement, proposal.quote); assert.equal(proposal.fragmentId, "fragment-a"); assert.equal(proposal.comparisonKey, null);
}
assert.equal(extractFactProposals({ id: "version-b-fragment", text })[0].fingerprint, proposals[0].fingerprint);
assert.equal(extractFactProposals({ id: "other", text: "El contrato fue firmado el 12 de mayo de 2025.\nEl contrato fue firmado el 12 de mayo de 2025." }).length, 1);
assert.equal(extractFactProposals({ id: "other", text: "¿Se pagaron CLP 25.000?" }).length, 0);
assert.equal(extractFactProposals({ id: "other", text: "Por ejemplo, se pagaron CLP 25.000." }).length, 0);
assert.equal(extractFactProposals({ id: "other", text: "FECHA DEL DOCUMENTO: 2025-05-12. Cargado el 2025-05-13. Página 12." }).length, 0);
assert.equal(extractFactProposals({ id: "other", text: "El contrato fue firmado." }).length, 0, "No event date is supplied by the document upload timestamp");
assert.equal(analyzeEvidenceFragment({ id: "other", text }, { maxProposals: 1 }).limited, true);
assert.equal(analyzeEvidenceFragment({ id: "other", text: "x".repeat(KNOWLEDGE_EXTRACTION_LIMITS.inputCharacters + 1) }).limited, true);
assert.throws(() => extractFactProposals({ id: "other", text }, { maxProposals: 11 }), /Límite/);

const facts: ComparableFact[] = [
  { id: "a", comparisonKey: "firma del contrato", statement: "El contrato fue firmado el 12 de mayo de 2025." },
  { id: "b", comparisonKey: "firma del contrato", statement: "El contrato fue firmado el 14 de mayo de 2025." },
];
const dateConflict = detectPotentialContradictions(facts);
assert.equal(dateConflict.length, 1); assert.equal(dateConflict[0].kind, "date"); assert.equal(dateConflict[0].status, "proposed");
assert.deepEqual(detectPotentialContradictions([...facts].reverse()), dateConflict, "Pair identity is stable across input order");
assert.equal(detectPotentialContradictions(facts.map(fact => ({ ...fact, comparisonKey: null }))).length, 0);
assert.equal(detectPotentialContradictions([{ ...facts[0] }, { ...facts[1], comparisonKey: "otra firma" }]).length, 0);
assert.equal(detectPotentialContradictions([{ ...facts[0], statement: "El contrato fue firmado durante mayo de 2025." }, facts[1]]).length, 0, "Overlapping precision intervals are not contradictions");
assert.equal(detectPotentialContradictions([{ ...facts[0], statement: "El contrato fue firmado el 03/04/2025." }, facts[1]]).length, 0);
assert.equal(detectPotentialContradictions([{ ...facts[0], statement: "El contrato no fue firmado el 12 de mayo de 2025." }, facts[1]]).length, 0);

function money(left: string, right: string) { return detectPotentialContradictions([{ id: "a", comparisonKey: "pago-1", statement: left }, { id: "b", comparisonKey: "pago-1", statement: right }]); }
assert.equal(money("Se pagaron CLP 25000.", "Se pagaron CLP 26000.")[0].kind, "money");
assert.equal(money("Se pagaron CLP 25000.", "Se pagaron CLP 25.000.").length, 0);
assert.equal(money("Se pagaron USD 25000.", "Se pagaron CLP 26000.").length, 0);
assert.equal(money("Se pagaron $25000.", "Se pagaron $26000.").length, 0);
assert.equal(money("Se pagaron CLP 25000 el 12 de mayo de 2025.", "Se pagaron CLP 26000 el 12 de mayo de 2025.")[0].kind, "money");
assert.equal(money("Se pagaron CLP 25000 en mayo de 2025.", "Se pagaron CLP 26000 en junio de 2025.").filter(row => row.kind === "money").length, 0);
assert.equal(money("El monto mensual fue CLP 25000.", "El monto anual fue CLP 26000.").length, 0);
assert.equal(money("La cuota 1 fue CLP 25000.", "La cuota 2 fue CLP 26000.").length, 0);
assert.equal(money("El saldo fue CLP 25000.", "El monto total fue CLP 26000.").length, 0);
assert.equal(money("Se pagaron aproximadamente CLP 25000.", "Se pagaron CLP 26000.").length, 0);
assert.equal(money("No se pagaron CLP 25000.", "Se pagaron CLP 26000.").length, 0);
assert.equal(money("Se pagaron CLP 25000 y CLP 5000.", "Se pagaron CLP 26000.").length, 0);
assert.equal(money("El saldo fue -25000 pesos chilenos.", "El saldo fue 25000 pesos chilenos.")[0].kind, "money");
assert.equal(money("El saldo fue CLP 100 millones.", "El saldo fue CLP 100000000.").length, 0);
assert.equal(money("El pago fue CLP 25000 mensuales.", "El pago fue CLP 26000 anuales.").length, 0);
assert.equal(money("El pago fue CLP 25000 en mayo.", "El pago fue CLP 26000 en junio.").length, 0);
assert.equal(money("El pago fue CLP 25000 en el primer semestre.", "El pago fue CLP 26000 en el segundo semestre.").length, 0);
assert.throws(() => detectPotentialContradictions(Array.from({ length: 201 }, (_, index) => ({ id: String(index), statement: "pago", comparisonKey: "pago" }))), /Acote/);

console.log("knowledge extraction OK: literal quotes, stable dedupe, calendar precision/ranges/ambiguity, no upload-date inference, explicit currencies/decimals, human comparison keys, period/basis/negation abstention and bounded proposals");
