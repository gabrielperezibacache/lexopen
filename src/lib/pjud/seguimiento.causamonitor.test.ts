/**
 * Test de seguimiento de causas — flujo producto CausaMonitor (offline).
 *
 * Simula la misma secuencia operativa que CM:
 *  1) Alta por ROL + tribunal
 *  2) Activar monitoreo
 *  3) Sync (demo CM: cuadernos, receptor, escritos por resolver, sala)
 *  4) Cola due-based / concurrency
 *  5) Digest 8AM (secciones Receptor / Escritos)
 *  6) CSV cartera
 *  7) Programación de salas (match RIT)
 *  8) Semáforo rojo sin novedades recientes
 *
 * No requiere OJV live ni Postgres: usa fixtures/helpers reales de LexOpen.
 */
import assert from "node:assert/strict";
import { TRIBUNALES_CHILE, validarRit } from "@/lib/chile";
import {
  diasEntre,
  isEscritoPendienteResolucion,
  semaforoPorDiasSinMovimiento,
} from "@/lib/pjud/classify";
import {
  formatDigestText,
  isDigestRelevantMovimiento,
  selectDigestCausa,
  type DigestItem,
} from "@/lib/pjud/digest";
import {
  CAUSAS_CSV_HEADER,
  parseCausasCsv,
  serializeCausasCsv,
} from "@/lib/pjud/import-csv";
import { mergePjudMovimientos } from "@/lib/pjud/public-scrape";
import {
  buildCausaMonitorDemoFetch,
  pjudSyncIntervalMs,
} from "@/lib/pjud/provider";
import { dueSyncWhere, pjudSyncConcurrency } from "@/lib/pjud/queue";
import {
  demoSalasTablaHtml,
  formatSalaMatchNote,
  matchMonitoredCausasToSalas,
  parseSalasTablaHtml,
} from "@/lib/pjud/salas";
import { encryptSecret, decryptSecret, maskRut } from "@/lib/pjud/secret";
import type { PjudCausaRef, PjudFetchedMovimiento } from "@/lib/pjud/types";

const tribunal = TRIBUNALES_CHILE[0];
const rit = "C-4521-2025";
assert.equal(validarRit(rit), true);
assert.ok(TRIBUNALES_CHILE.length >= 40, "catálogo tribunales ampliado");

// --- 1) Alta por ROL (validación de forma CausaMonitor) ---
const alta = {
  rit,
  tribunal,
  titulo: "Pérez con Municipalidad",
  monitoreoActivo: true,
  syncNow: true,
};
assert.equal(alta.monitoreoActivo, true);
assert.ok(TRIBUNALES_CHILE.includes(tribunal as (typeof TRIBUNALES_CHILE)[number]));

// --- 2+3) Sync demo CM ---
const causaRef: PjudCausaRef = {
  id: "causa-demo-1",
  rit,
  ruc: null,
  tribunal,
  titulo: alta.titulo,
  caratula: alta.titulo,
};
const fetchResult = buildCausaMonitorDemoFetch(causaRef);
assert.equal(fetchResult.provider, "demo");
assert.equal(fetchResult.demo, true);
assert.ok(fetchResult.sala);
assert.ok(fetchResult.movimientos.length >= 8);

const cuadernos = [
  ...new Set(fetchResult.movimientos.map((m) => m.cuaderno || "Principal")),
];
assert.ok(cuadernos.includes("Principal"));
assert.ok(cuadernos.includes("Apelación"));

const receptor = fetchResult.movimientos.filter((m) => m.esReceptor);
assert.ok(receptor.length >= 2, "CM: notificaciones de receptor");

const escritosPendientes = fetchResult.movimientos.filter(
  (m) => m.pendienteResolucion
);
assert.ok(escritosPendientes.length >= 1, "CM: escritos por resolver");
assert.equal(
  isEscritoPendienteResolucion(escritosPendientes[0].titulo),
  true
);

// Métricas post-sync (como SyncCausaResult)
const syncMetrics = {
  inserted: fetchResult.movimientos.length,
  skipped: 0,
  provider: fetchResult.provider,
  receptorCount: receptor.length,
  escritosPendientes: escritosPendientes.length,
  cuadernos,
  sala: fetchResult.sala,
  diasSinMovimiento: diasEntre(
    fetchResult.movimientos.reduce(
      (latest, m) => (m.fecha > latest ? m.fecha : latest),
      fetchResult.movimientos[0].fecha
    )
  ),
};
assert.equal(syncMetrics.provider, "demo");
assert.ok(syncMetrics.receptorCount >= 2);
assert.ok(syncMetrics.escritosPendientes >= 1);
assert.equal(semaforoPorDiasSinMovimiento(syncMetrics.diasSinMovimiento), "verde");

// --- 4) Cola due-based ---
const now = new Date("2026-08-12T15:00:00.000Z");
const dueAll = dueSyncWhere({ now });
assert.equal(dueAll.pjudMonitoreoActivo, true);
assert.ok(Array.isArray(dueAll.OR));

const dueExplicit = dueSyncWhere({ causaIds: [causaRef.id], now });
assert.deepEqual(dueExplicit.id, { in: [causaRef.id] });

const prevConc = process.env.PJUD_SYNC_CONCURRENCY;
delete process.env.PJUD_SYNC_CONCURRENCY;
assert.equal(pjudSyncConcurrency(), 5, "CM worker concurrency default 5");
if (prevConc === undefined) delete process.env.PJUD_SYNC_CONCURRENCY;
else process.env.PJUD_SYNC_CONCURRENCY = prevConc;

const prevInterval = process.env.PJUD_SYNC_INTERVAL_MINUTES;
delete process.env.PJUD_SYNC_INTERVAL_MINUTES;
assert.equal(pjudSyncIntervalMs(), 240 * 60 * 1000, "CM Pro ~4h");
if (prevInterval === undefined) delete process.env.PJUD_SYNC_INTERVAL_MINUTES;
else process.env.PJUD_SYNC_INTERVAL_MINUTES = prevInterval;

// --- 5) Digest estilo 8AM ---
const recentForDigest = fetchResult.movimientos
  .filter((m) => diasEntre(m.fecha) <= 40)
  .map((m) => ({
    titulo: m.titulo,
    fecha: m.fecha,
    tipo: m.tipo || "otro",
    esReceptor: Boolean(m.esReceptor),
    relevante: Boolean(m.relevante),
    pendienteResolucion: Boolean(m.pendienteResolucion),
  }));

assert.equal(
  isDigestRelevantMovimiento(
    {
      relevante: false,
      esReceptor: false,
      pendienteResolucion: true,
    },
    "verde"
  ),
  true
);

const digestItem: DigestItem = {
  causaId: causaRef.id,
  rit,
  titulo: alta.titulo,
  tribunal,
  semaforo: "verde",
  movimientos: recentForDigest.filter((m) =>
    isDigestRelevantMovimiento(m, "verde")
  ),
};
const digestText = formatDigestText([digestItem], "https://lexopen.local");
assert.match(digestText, /Receptor:/);
assert.match(digestText, /Escritos por resolver:/);
assert.match(digestText, new RegExp(rit));

// --- 6) CSV cartera roundtrip ---
const csv = serializeCausasCsv([
  {
    rit,
    tribunal,
    titulo: alta.titulo,
    ruc: null,
    materia: "Civil",
  },
]);
assert.match(csv, new RegExp(CAUSAS_CSV_HEADER));
const parsed = parseCausasCsv(csv);
assert.equal(parsed.length, 1);
assert.equal(parsed[0].rit, rit);
assert.equal(parsed[0].tribunal, tribunal);

// --- 7) Programación de salas ---
const html = demoSalasTablaHtml({
  rit,
  fecha: "15/08/2026",
  sala: "Sala 3",
  corte: "Corte de Apelaciones de Santiago",
});
const agenda = parseSalasTablaHtml(html);
assert.ok(agenda.some((e) => e.rit === rit));
const matches = matchMonitoredCausasToSalas(
  [{ id: causaRef.id, rit, tribunal, titulo: alta.titulo }],
  agenda
);
assert.equal(matches.length, 1);
assert.match(formatSalaMatchNote(matches[0]), /En tabla/);
assert.match(formatSalaMatchNote(matches[0]), /Sala 3/);

// --- 8) Semáforo rojo quiet (CM: alerta aunque no haya novedades) ---
const quiet = selectDigestCausa({
  recentMovimientos: [],
  lastMovimientoAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
});
assert.equal(quiet.include, true);
assert.equal(quiet.semaforo, "rojo");
const quietDigest = formatDigestText(
  [
    {
      causaId: "quiet",
      rit: "C-1-2020",
      titulo: "Inactiva",
      tribunal,
      semaforo: "rojo",
      movimientos: [],
    },
  ],
  "https://lexopen.local"
);
assert.match(quietDigest, /semáforo rojo/);

// --- Extra: merge tabs receptor (scrape modal) ---
const base: PjudFetchedMovimiento[] = fetchResult.movimientos.slice(0, 2);
const extraReceptor: PjudFetchedMovimiento[] = [
  {
    ...fetchResult.movimientos[0],
    esReceptor: true,
    relevante: true,
    tipo: "notificacion",
  },
];
const merged = mergePjudMovimientos(base, extraReceptor);
assert.ok(merged.some((m) => m.esReceptor));

// --- Extra: vault ClaveÚnica local (CM /api/pjud-credentials) ---
const prevKey = process.env.PJUD_SECRETS_KEY;
process.env.PJUD_SECRETS_KEY = "seguimiento-test-secrets-key";
const enc = encryptSecret("clave-unica-secreta");
assert.ok(enc.startsWith("enc:v2:"));
assert.equal(decryptSecret(enc), "clave-unica-secreta");
assert.equal(maskRut("12.345.678-5"), "12****-5");
if (prevKey === undefined) delete process.env.PJUD_SECRETS_KEY;
else process.env.PJUD_SECRETS_KEY = prevKey;

console.log("pjud/seguimiento.causamonitor.test.ts OK");
