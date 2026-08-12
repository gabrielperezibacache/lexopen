import assert from "node:assert/strict";
import {
  AI_UTILITIES,
  getAiUtility,
  inferAiUtility,
} from "@/lib/ai/utilities";
import { formatPlazoEstimate } from "@/lib/ai/local-assist";

assert.ok(AI_UTILITIES.length >= 6);
assert.equal(getAiUtility("doc_qa").id, "doc_qa");
assert.equal(getAiUtility("nope").id, "copilot");
assert.equal(inferAiUtility("revisa el plazo fatal"), "plazos");
assert.equal(inferAiUtility("redacta un memorial"), "draft");
assert.equal(inferAiUtility("qué dice el documento PDF"), "doc_qa");
assert.equal(inferAiUtility("revisa la carpeta investigativa"), "doc_qa");
assert.equal(inferAiUtility("busca jurisprudencia"), "research");

const est = formatPlazoEstimate({
  desde: "2026-08-01",
  dias: 5,
  tipoComputo: "habiles",
});
assert.ok(!("error" in est));
assert.match(est.vencimiento, /^\d{4}-\d{2}-\d{2}$/);
assert.match(est.disclaimer, /Estimación interna/);

console.log("ai/utilities.test.ts OK");
