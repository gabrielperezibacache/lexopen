import assert from "node:assert/strict";
import { buildAiSuggestedActions } from "@/lib/ai/suggested-actions";

const plazos = buildAiSuggestedActions({
  utility: "plazos",
  causaId: "c1",
});
assert.ok(plazos.some((a) => a.href.includes("/plazos?causaId=c1")));
assert.ok(plazos.some((a) => a.href === "/causas/c1"));

const docQa = buildAiSuggestedActions({
  utility: "doc_qa",
  causaId: "c1",
});
assert.ok(docQa.some((a) => a.href.includes("/documentos?causaId=c1")));

const research = buildAiSuggestedActions({
  utility: "research",
  causaId: null,
});
assert.ok(research.some((a) => a.href === "/jurisprudencia"));
assert.ok(!research.some((a) => a.label === "Abrir causa"));

const draft = buildAiSuggestedActions({ utility: "draft", causaId: "c9" });
assert.ok(draft.some((a) => a.href === "/causas/c9/minuta/nueva"));

console.log("ai/suggested-actions.test.ts OK");
