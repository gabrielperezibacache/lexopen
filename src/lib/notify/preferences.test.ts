import assert from "node:assert/strict";
import {
  isQuietAt,
  modoPara,
  nextDigestAt,
  quietUntil,
  resolveDeliveries,
  DEFAULT_PERFIL,
  type Destino,
} from "./preferences";

const email: Destino = { canal: "email", canalUsuarioId: null, nivel: "estandar" };
const telegram: Destino = {
  canal: "telegram",
  canalUsuarioId: "c1",
  nivel: "minimo",
};

// Crítico no se apaga: si todos off → fuerza email realtime.
{
  const deliveries = resolveDeliveries({
    tipo: "plazo.fatal",
    prefs: [
      { tipo: "plazo.fatal", canal: "email", modo: "off" },
      { tipo: "plazo.fatal", canal: "telegram", modo: "off" },
      { tipo: "plazo.fatal", canal: "push", modo: "off" },
    ],
    destinos: [email, telegram],
    perfil: DEFAULT_PERFIL,
    now: new Date("2026-06-15T15:00:00.000Z"),
  });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0]!.destino.canal, "email");
  assert.equal(deliveries[0]!.modo, "realtime");
}

// Quiet hours Chile (21:00–08:00): 23:30 CLT = UTC−4 en junio? Chile invierno UTC-4.
// 2026-06-15 23:30 America/Santiago ≈ 2026-06-16T03:30:00.000Z
{
  const late = new Date("2026-06-16T03:30:00.000Z");
  assert.equal(isQuietAt(late, DEFAULT_PERFIL), true);
  const until = quietUntil(late, DEFAULT_PERFIL);
  assert.ok(until);
  assert.equal(isQuietAt(until!, DEFAULT_PERFIL), false);
}

// Críticos atraviesan silencio.
{
  const late = new Date("2026-06-16T03:30:00.000Z");
  const deliveries = resolveDeliveries({
    tipo: "plazo.fatal",
    prefs: [],
    destinos: [email],
    perfil: DEFAULT_PERFIL,
    now: late,
  });
  assert.equal(deliveries[0]!.sendAt.getTime(), late.getTime());
}

// No crítico se aplaza.
{
  const late = new Date("2026-06-16T03:30:00.000Z");
  const deliveries = resolveDeliveries({
    tipo: "tarea.asignada",
    prefs: [{ tipo: "tarea.asignada", canal: "email", modo: "realtime" }],
    destinos: [email],
    perfil: DEFAULT_PERFIL,
    now: late,
  });
  assert.ok(deliveries[0]!.sendAt.getTime() > late.getTime());
}

assert.equal(modoPara("plazo.normal", "email", []), "digest_diario");
assert.equal(
  modoPara("plazo.normal", "email", [
    { tipo: "plazo.normal", canal: "email", modo: "off" },
  ]),
  "off"
);

{
  const now = new Date("2026-06-16T12:00:00.000Z");
  const next = nextDigestAt(now, "digest_diario", "America/Santiago");
  assert.ok(next > now);
}

console.log("notify/preferences.test.ts OK");
