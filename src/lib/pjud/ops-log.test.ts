import assert from "node:assert/strict";
import { buildPjudOpsLog } from "./ops-log";

const down = buildPjudOpsLog({
  generatedAt: "2026-08-18T01:00:00.000Z",
  honesty:
    "El servicio auxiliar no responde; LexOpen usará la consulta directa. Arranque el auxiliar en el Host o revise Configuración → PJUD.",
  liveIngestConfigured: true,
  sidecar: { configured: true, reachable: false, scrapeReady: null, error: null },
  captcha: { configError: null },
  failedJobs: 0,
});

assert.ok(down.some((e) => e.source === "canal" && e.level === "warn"));
assert.ok(
  down.some((e) =>
    /servicio auxiliar no responde/i.test(e.message)
  )
);

const captcha = buildPjudOpsLog({
  generatedAt: "2026-08-18T01:00:00.000Z",
  honesty: "Aún no hay consulta en vivo.",
  liveIngestConfigured: false,
  captcha: { configError: "Falta CAPTCHA_SOLVER_API_KEY" },
});
assert.ok(captcha.some((e) => e.source === "captcha" && e.level === "error"));
assert.equal(captcha[0].level, "error");

const healthy = buildPjudOpsLog({
  generatedAt: "2026-08-18T01:00:00.000Z",
  honesty: "La consulta en vivo está lista.",
  liveIngestConfigured: true,
  sidecar: { configured: false, reachable: false, scrapeReady: null, error: null },
});
assert.equal(healthy.length, 1);
assert.equal(healthy[0].level, "info");

console.log("pjud/ops-log.test.ts OK");
