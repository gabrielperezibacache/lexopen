/**
 * Resolución pura de canales: preferencias + defaults del catálogo + horas de
 * silencio + reglas de críticos (no apagables, atraviesan el silencio).
 */

import {
  EXTERNAL_CHANNELS,
  isModo,
  tipoDef,
  type ExternalChannel,
  type Modo,
  type NivelDetalle,
} from "@/lib/notify/catalog";
import { addDaysYmd, parseHhmm, safeTimeZone, wallParts, zonedTime } from "@/lib/notify/time";

export type PerfilNotif = {
  quietDesde: string;
  quietHasta: string;
  quietFinesSemana: boolean;
  zonaHoraria: string;
  nivelEmail: NivelDetalle;
  silenciadoHasta: Date | null;
};

export const DEFAULT_PERFIL: PerfilNotif = {
  quietDesde: "21:00",
  quietHasta: "08:00",
  quietFinesSemana: true,
  zonaHoraria: "America/Santiago",
  nivelEmail: "estandar",
  silenciadoHasta: null,
};

export const DIGEST_HORA = "08:00";

export type PrefRow = { tipo: string; canal: string; modo: string };

export type Destino = {
  canal: ExternalChannel;
  canalUsuarioId: string | null;
  nivel: NivelDetalle;
};

export type Delivery = {
  destino: Destino;
  modo: Exclude<Modo, "off">;
  sendAt: Date;
};

export function modoPara(tipo: string, canal: ExternalChannel, prefs: PrefRow[]): Modo {
  const def = tipoDef(tipo);
  const exact = prefs.find((p) => p.tipo === tipo && p.canal === canal);
  const wildcard = prefs.find((p) => p.tipo === "*" && p.canal === canal);
  const raw = exact?.modo ?? (def.apagable ? wildcard?.modo : undefined) ?? def.defaults[canal];
  const modo: Modo = isModo(raw) ? raw : def.defaults[canal];
  if (!def.apagable && modo !== "off") return "realtime";
  return modo;
}

export function isQuietAt(date: Date, perfil: PerfilNotif): boolean {
  const tz = safeTimeZone(perfil.zonaHoraria);
  const p = wallParts(date, tz);
  if (perfil.quietFinesSemana && (p.weekday === 0 || p.weekday === 6)) return true;
  const desde = parseHhmm(perfil.quietDesde, DEFAULT_PERFIL.quietDesde);
  const hasta = parseHhmm(perfil.quietHasta, DEFAULT_PERFIL.quietHasta);
  if (desde === hasta) return false;
  const m = p.hour * 60 + p.minute;
  return desde > hasta ? m >= desde || m < hasta : m >= desde && m < hasta;
}

/** First instant at or after `now` outside quiet hours (null if not quiet now). */
export function quietUntil(now: Date, perfil: PerfilNotif): Date | null {
  if (!isQuietAt(now, perfil)) return null;
  const step = 30 * 60_000;
  let t = now.getTime();
  const limit = t + 5 * 24 * 60 * 60_000;
  while (t < limit && isQuietAt(new Date(t), perfil)) t += step;
  if (t >= limit) return null;
  t = Math.floor(t / 60_000) * 60_000;
  while (t - 60_000 > now.getTime() && !isQuietAt(new Date(t - 60_000), perfil)) t -= 60_000;
  return new Date(t);
}

export function nextDigestAt(now: Date, modo: "digest_diario" | "digest_semanal", tzRaw: string): Date {
  const tz = safeTimeZone(tzRaw);
  const today = wallParts(now, tz);
  if (modo === "digest_diario") {
    const slot = zonedTime(today.ymd, DIGEST_HORA, tz);
    return slot > now ? slot : zonedTime(addDaysYmd(today.ymd, 1), DIGEST_HORA, tz);
  }
  const daysToMonday = (8 - today.weekday) % 7;
  const monday = addDaysYmd(today.ymd, daysToMonday);
  const slot = zonedTime(monday, DIGEST_HORA, tz);
  return slot > now ? slot : zonedTime(addDaysYmd(monday, 7), DIGEST_HORA, tz);
}

export function resolveDeliveries(opts: {
  tipo: string;
  prefs: PrefRow[];
  destinos: Destino[];
  perfil: PerfilNotif;
  now: Date;
}): Delivery[] {
  const def = tipoDef(opts.tipo);
  const critical = def.severidad === "critica";
  const chosen: Array<{ destino: Destino; modo: Modo }> = opts.destinos.map((destino) => ({
    destino,
    modo: modoPara(opts.tipo, destino.canal, opts.prefs),
  }));

  if (!def.apagable && opts.destinos.length && chosen.every((c) => c.modo === "off")) {
    const fallback = [...opts.destinos].sort(
      (a, b) => EXTERNAL_CHANNELS.indexOf(a.canal) - EXTERNAL_CHANNELS.indexOf(b.canal)
    )[0];
    for (const c of chosen) if (c.destino.canal === fallback.canal) c.modo = "realtime";
  }

  const out: Delivery[] = [];
  for (const c of chosen) {
    if (c.modo === "off") continue;
    if (c.modo === "digest_diario" || c.modo === "digest_semanal") {
      out.push({ destino: c.destino, modo: c.modo, sendAt: nextDigestAt(opts.now, c.modo, opts.perfil.zonaHoraria) });
      continue;
    }
    let sendAt = opts.now;
    if (!critical) {
      const silenced = opts.perfil.silenciadoHasta;
      if (silenced && silenced > sendAt) sendAt = silenced;
      const quiet = quietUntil(sendAt, opts.perfil);
      if (quiet) sendAt = quiet;
    }
    out.push({ destino: c.destino, modo: "realtime", sendAt });
  }
  return out;
}
