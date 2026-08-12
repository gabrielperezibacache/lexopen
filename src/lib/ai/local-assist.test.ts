import assert from "node:assert/strict";
import {
  buildLocalBriefingMarkdown,
  formatPlazoEstimate,
} from "@/lib/ai/local-assist";

const bad = formatPlazoEstimate({
  desde: "no-es-fecha",
  dias: 5,
  tipoComputo: "habiles",
});
assert.ok("error" in bad);
assert.equal(typeof bad.error, "string");
assert.match(String(bad.error), /inválida/i);

const badDias = formatPlazoEstimate({
  desde: "2026-08-01",
  dias: 0,
  tipoComputo: "habiles",
});
assert.ok("error" in badDias);
assert.match(String(badDias.error), /días/i);

const badNaN = formatPlazoEstimate({
  desde: "2026-08-01",
  dias: Number.NaN,
  tipoComputo: "corridos",
});
assert.ok("error" in badNaN);

const ok = formatPlazoEstimate({
  desde: "2026-08-03", // lunes
  dias: 5,
  tipoComputo: "habiles",
});
assert.ok(!("error" in ok));
assert.match(ok.vencimiento, /^\d{4}-\d{2}-\d{2}$/);
assert.ok(typeof ok.diasRestantes === "number");
assert.match(ok.disclaimer, /Estimación interna/);

const corridos = formatPlazoEstimate({
  desde: "2026-08-01",
  dias: 3,
  tipoComputo: "corridos",
});
assert.ok(!("error" in corridos));
assert.equal(corridos.vencimiento, "2026-08-04");

const briefing = buildLocalBriefingMarkdown({
  causaLabel: "C-1-2026",
  alerts: ["Plazo fatal próximo"],
  sourcesCount: 4,
});
assert.match(briefing, /Briefing operativo/);
assert.match(briefing, /C-1-2026/);
assert.match(briefing, /Plazo fatal/);
assert.match(briefing, /Fuentes ancladas:\*\* 4/);

console.log("ai/local-assist.test.ts OK");
