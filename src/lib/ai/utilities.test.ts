import assert from "node:assert/strict";
import {
  AI_UTILITIES,
  extractSearchNeedles,
  getAiUtility,
  inferAiUtility,
} from "@/lib/ai/utilities";

assert.ok(AI_UTILITIES.length >= 6);
assert.equal(getAiUtility("doc_qa").id, "doc_qa");
assert.equal(getAiUtility("nope").id, "copilot");
assert.equal(inferAiUtility("revisa el plazo fatal"), "plazos");
assert.equal(inferAiUtility("redacta un memorial"), "draft");
assert.equal(inferAiUtility("qué dice el documento PDF"), "doc_qa");
assert.equal(inferAiUtility("busca jurisprudencia"), "research");

const needles = extractSearchNeedles(
  "Busca doctrina útil sobre prescripción adquisitiva en materia civil"
);
assert.ok(needles.includes("doctrina") || needles.includes("prescripcion"));
assert.ok(!needles.includes("busca"));
assert.ok(needles.length >= 1 && needles.length <= 4);

console.log("ai/utilities.test.ts OK");
