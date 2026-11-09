/** Explicit opt-in: two anonymous public operations (each creates its own session). No DB/storage/model. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { searchPublicPjudJudgments, fetchPublicLegalSource } from "../src/lib/research/sources";
async function main() {
  if (process.env.PJUD_LIVE_CONFIRM !== "1") throw new Error("Esta prueba consulta el portal público. Ejecute con PJUD_LIVE_CONFIRM=1 y PJUD_LIVE_ROL=número-año.");
  const rol = process.env.PJUD_LIVE_ROL || "";
  if (!/^(?:[A-Za-z]{1,3}-)?[1-9]\d{0,8}-\d{4}$/.test(rol)) throw new Error("PJUD_LIVE_ROL debe incluir número y año");
  // A proxy-only test transport is opt-in and never changes the production DNS-pinned transport.
  const proxy = process.env.PJUD_LIVE_USE_ENV_PROXY === "1";
  if (proxy && process.env.NODE_USE_ENV_PROXY !== "1") throw new Error("El transporte de prueba requiere NODE_USE_ENV_PROXY=1 en una versión de Node que lo soporte");
  const options = proxy ? { fetch: globalThis.fetch } : {};
  const result = await searchPublicPjudJudgments({ rol, terms: "", page: 0 }, options);
  assert.ok(result.items.length, "No se recibió una muestra de fallos para validar recuperación");
  const selected = result.items[0];
  const source = await fetchPublicLegalSource(selected.importUrl, options);
  assert.equal(source.externalId, `PJUD:${selected.id}`);
  assert.equal(source.mimeType, "application/json");
  assert.ok(source.text.trim() && source.rawBytes.length);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), transport: proxy ? "test-env-proxy" : "production-dns-pinned", resultCount: result.items.length, totalReported: result.totalReported,
    externalId: source.externalId, textChars: source.text.length, originalBytes: source.rawBytes.length,
    sourceSha256: createHash("sha256").update(source.rawBytes).digest("hex"),
    textSha256: createHash("sha256").update(source.text).digest("hex"), stored: false, pdf: false, modelUsed: false }));
}
main().catch(error => { console.error(JSON.stringify({ ok: false, code: error?.code || "live_probe_failed", message: error instanceof Error ? error.message : "Error de prueba viva" })); process.exitCode = 1; });
