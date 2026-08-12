import assert from "node:assert/strict";
import { buildAiSuggestedActions } from "@/lib/ai/suggested-actions";

const plazos = buildAiSuggestedActions({
  utility: "plazos",
  causaId: "c1",
});
assert.ok(plazos.some((a) => a.href.includes("/plazos?causaId=c1")));
assert.ok(plazos.some((a) => a.href === "/causas/c1"));
assert.ok(!plazos.some((a) => a.label === "Nueva minuta"));

const docQa = buildAiSuggestedActions({
  utility: "doc_qa",
  causaId: "c1",
});
assert.ok(docQa.some((a) => a.href.includes("/documentos?causaId=c1")));
assert.ok(!docQa.some((a) => a.href === "/causas/monitoreo"));

const research = buildAiSuggestedActions({
  utility: "research",
  causaId: null,
});
assert.ok(research.some((a) => a.href === "/jurisprudencia"));
assert.ok(!research.some((a) => a.label === "Abrir causa"));

const draft = buildAiSuggestedActions({ utility: "draft", causaId: "c9" });
assert.equal(
  draft.filter((a) => a.href === "/causas/c9/minuta/nueva").length,
  1
);

console.log("ai/suggested-actions.test.ts OK");
