import assert from "node:assert/strict";
import { normalizeAssistantInput } from "@/lib/assistant/normalize";
import { classifyIntents } from "@/lib/assistant/classify";
import { explicitCaseJobIntent } from "@/lib/assistant/classify-rules";
import { validateReport } from "./worker";
import { emptyReport } from "./types";
import type { CaseReference } from "./types";
async function main() {
  for (const text of [
    "Revisa esta causa, identifica pendientes y prepara un borrador",
    "Encárgate de esta causa y organiza el trabajo",
    "Por favor, analiza este expediente",
  ]) {
    const result = await classifyIntents(normalizeAssistantInput(text), {
      altazorContext: true,
      forceLocal: true,
    });
    assert.equal(result.intents[0].toolId, "causa.encargar");
    assert.equal(result.source, "rule");
  }
  for (const text of [
    "No revises esta causa",
    "Traduce: Revisa esta causa",
    "Por ejemplo, revisa esta causa",
    "Copia `revisa esta causa`",
    "Revisa otra causa",
    "¿Qué significa revisar esta causa?",
  ])
    assert.equal(
      explicitCaseJobIntent(normalizeAssistantInput(text)),
      undefined,
    );
  const refs = [
    { id: "R9", source: { text: "El comprobante ficticio debe cotejarse." } },
  ] as CaseReference[];
  const good = {
    ...emptyReport(),summary:"Propuesta para revisar",
    citations: [{ sourceId: "R9", quote: "comprobante ficticio" }],
    tasks: [
      {
        title: "Cotejar",
        description: "Revisar antes de actuar.",
        sourceIds: ["R9"],
      },
    ],
  };
  assert.equal(validateReport(good, refs).citations[0].sourceId, "R9");
  assert.throws(() =>
    validateReport(
      {
        ...good,
        citations: [{ sourceId: "R9", quote: "Un pago que no aparece" }],
      },
      refs,
    ),
  );
  assert.throws(() =>
    validateReport(
      { ...good, tasks: [{ ...good.tasks[0], sourceIds: ["R10"] }] },
      refs,
    ),
  );
  assert.throws(() =>
    validateReport(
      {
        ...good,
        draft: { title: "Borrador", body: "Texto [R10]", sourceIds: ["R9"] },
      },
      refs,
    ),
  );
  assert.throws(() =>
    validateReport(
      { ...good, citations: [...good.citations, ...good.citations] },
      refs,
    ),
  );
  assert.equal(
    validateReport(
      { ...good, citations: [{ sourceId: "R9", quote: "[R404] literal" }] },
      [{ id: "R9", source: { text: "[R404] literal" } }] as CaseReference[],
    ).citations[0].quote,
    "[R404] literal",
  );
  assert.throws(()=>validateReport(emptyReport(),[]),"an empty structured response is not completed work");
  console.log(
    "Case jobs unit PASS: explicit native routing only, negative/quoted/example isolation, literal citations and unknown/duplicate references rejected.",
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
