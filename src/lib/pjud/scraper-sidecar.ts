/**
 * Sidecar HTTP scraper (proceso local / red privada del host).
 * Env: PJUD_SCRAPER_URL (+ opcional PJUD_SCRAPER_KEY)
 * Preferir `http://127.0.0.1:8787` con PJUD_SCRAPER_ALLOW_PRIVATE=1.
 *
 * Contratos:
 *   POST {url}/causas/lookup  { rit, ruc?, tribunal }
 *   POST {url}/mis-causas     { rut, password }
 */

import { z } from "zod";
import { parseLocalDateInput } from "@/lib/minutas";
import { classifyMovimiento } from "@/lib/pjud/classify";
import {
  isCloudMetadataHostname,
  isPrivateOrLocalHostname,
} from "@/lib/net/safe-url";
import {
  fingerprint,
  type PjudCausaRef,
  type PjudFetchResult,
  type PjudFetchedMovimiento,
} from "@/lib/pjud/types";
import type { MisCausasItem } from "@/lib/pjud/public-scrape";

const movementSchema = z.object({
  id: z.string().max(255).optional(),
  titulo: z.string().trim().min(1).max(2000),
  detalle: z.string().max(20_000).optional().nullable(),
  fecha: z.string().min(1).max(100),
  referencia: z.string().max(500).optional().nullable(),
  cuaderno: z.string().max(200).optional().nullable(),
  folio: z.string().max(100).optional().nullable(),
  etapa: z.string().max(200).optional().nullable(),
  tramite: z.string().max(200).optional().nullable(),
  esReceptor: z.boolean().optional(),
  receptor: z.boolean().optional(),
  documentoRef: z.string().max(500).optional().nullable(),
});

export function scraperSidecarConfigured() {
  return Boolean(process.env.PJUD_SCRAPER_URL?.trim());
}

/** Normalized base URL (adds http:// for Render hostport). */
export function getScraperSidecarBaseUrl() {
  return scraperBaseUrl();
}

export type SidecarHealthProbe = {
  configured: boolean;
  reachable: boolean;
  scrapeReady: boolean | null;
  captcha: boolean | null;
  status: number | null;
  error: string | null;
  urlHost: string | null;
};

/** GET /health del sidecar (timeout corto; no expone secretos). */
export async function probeScraperSidecarHealth(
  timeoutMs = 2_500
): Promise<SidecarHealthProbe> {
  if (!scraperSidecarConfigured()) {
    return {
      configured: false,
      reachable: false,
      scrapeReady: null,
      captcha: null,
      status: null,
      error: null,
      urlHost: null,
    };
  }
  let base: string;
  let urlHost: string | null = null;
  try {
    base = scraperBaseUrl()!;
    urlHost = new URL(base).host;
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      scrapeReady: null,
      captcha: null,
      status: null,
      error: error instanceof Error ? error.message : String(error),
      urlHost: null,
    };
  }
  try {
    const res = await fetch(`${base}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await res.json().catch(() => ({}))) as {
      scrapeReady?: boolean;
      captcha?: boolean;
      ok?: boolean;
    };
    return {
      configured: true,
      reachable: res.ok,
      scrapeReady:
        typeof body.scrapeReady === "boolean" ? body.scrapeReady : null,
      captcha: typeof body.captcha === "boolean" ? body.captcha : null,
      status: res.status,
      error: res.ok ? null : `HTTP ${res.status}`,
      urlHost,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      scrapeReady: null,
      captcha: null,
      status: null,
      error: error instanceof Error ? error.message : String(error),
      urlHost,
    };
  }
}

function scraperBaseUrl() {
  const rawBase = process.env.PJUD_SCRAPER_URL?.trim();
  if (!rawBase) return null;
  // Render fromService hostport is "host:port" without scheme.
  const withScheme = /^https?:\/\//i.test(rawBase)
    ? rawBase
    : `http://${rawBase}`;
  const parsedBase = new URL(withScheme);
  const allowPrivate = process.env.PJUD_SCRAPER_ALLOW_PRIVATE === "1";
  const privateHost = isPrivateOrLocalHostname(parsedBase.hostname);
  if (
    parsedBase.username ||
    parsedBase.password ||
    (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:")
  ) {
    throw new Error("PJUD_SCRAPER_URL no cumple las restricciones de seguridad");
  }
  // Never allow cloud metadata endpoints, even with PJUD_SCRAPER_ALLOW_PRIVATE=1.
  if (isCloudMetadataHostname(parsedBase.hostname)) {
    throw new Error("PJUD_SCRAPER_URL apunta a un host de metadata bloqueado");
  }
  if (process.env.NODE_ENV === "production") {
    if (privateHost) {
      if (!allowPrivate) {
        throw new Error(
          "PJUD_SCRAPER_URL apunta a red privada; set PJUD_SCRAPER_ALLOW_PRIVATE=1 para sidecar interno del Host."
        );
      }
      // Private sidecar may use http on Render private network
    } else if (parsedBase.protocol !== "https:") {
      throw new Error("PJUD_SCRAPER_URL público requiere https en producción");
    }
  }
  return parsedBase.toString().replace(/\/$/, "");
}

function authHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(process.env.PJUD_SCRAPER_KEY
      ? { Authorization: `Bearer ${process.env.PJUD_SCRAPER_KEY}` }
      : {}),
  };
}

function mapMovements(
  rows: z.infer<typeof movementSchema>[]
): PjudFetchedMovimiento[] {
  return rows.map((m) => {
    const fecha = parseLocalDateInput(m.fecha);
    if (!fecha) throw new Error(`Fecha scrape inválida: ${m.fecha}`);
    const classified = classifyMovimiento(m.titulo, m.detalle);
    const esReceptor =
      Boolean(m.esReceptor ?? m.receptor) ||
      (classified.tipo === "notificacion" &&
        /receptor|c[eé]dula|notificaci[oó]n/i.test(
          `${m.titulo} ${m.detalle || ""}`
        ));
    const pendienteResolucion = Boolean(classified.pendienteResolucion);
    return {
      externalId: m.id
        ? `scrape:${m.id}`
        : `scrape:${fingerprint(m.titulo, fecha, m.referencia)}`,
      titulo: m.titulo,
      detalle: m.detalle || null,
      fecha,
      referencia: m.referencia || null,
      tipo: classified.tipo,
      relevante: classified.relevante || esReceptor || pendienteResolucion,
      fuente: "pjud" as const,
      cuaderno: m.cuaderno || "Principal",
      folio: m.folio || null,
      etapa: m.etapa || null,
      tramite: m.tramite || null,
      esReceptor,
      pendienteResolucion,
      documentoRef: m.documentoRef || null,
    };
  });
}

export async function fetchFromScraperSidecar(
  causa: PjudCausaRef
): Promise<PjudFetchResult | null> {
  const base = scraperBaseUrl();
  if (!base) return null;

  const res = await fetch(`${base}/causas/lookup`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      rit: causa.rit,
      ruc: causa.ruc,
      tribunal: causa.tribunal,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    throw new Error(`Scraper sidecar HTTP ${res.status}`);
  }
  const text = await res.text();
  if (text.length > 5 * 1024 * 1024) {
    throw new Error("Respuesta del scraper supera el límite");
  }
  const data = z
    .object({
      sala: z.string().max(200).optional().nullable(),
      note: z.string().max(2000).optional(),
      movimientos: z.array(movementSchema).max(5000).optional(),
    })
    .passthrough()
    .parse(JSON.parse(text));

  const movimientos = mapMovements(data.movimientos || []);
  return {
    provider: "scrape-sidecar",
    movimientos,
    note:
      data.note ||
      `Scraper sidecar (${movimientos.length} ítems). Flujo CausaMonitor vía PJUD_SCRAPER_URL.`,
    demo: false,
    sala: data.sala || null,
  };
}

export async function fetchMisCausasFromSidecar(opts: {
  rut: string;
  password: string;
}): Promise<MisCausasItem[] | null> {
  const base = scraperBaseUrl();
  if (!base) return null;
  const res = await fetch(`${base}/mis-causas`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ rut: opts.rut, password: opts.password }),
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`Scraper Mis Causas HTTP ${res.status}`);
  }
  const data = z
    .object({
      causas: z
        .array(
          z.object({
            rit: z.string().min(1).max(100),
            tribunal: z.string().min(1).max(255),
            caratula: z.string().max(2000).optional().nullable(),
            ruc: z.string().max(100).optional().nullable(),
            estado: z.string().max(200).optional().nullable(),
          })
        )
        .max(2000),
    })
    .parse(await res.json());
  return data.causas;
}

export async function buscarCausasByRutFromSidecar(
  rut: string
): Promise<MisCausasItem[] | null> {
  const base = scraperBaseUrl();
  if (!base) return null;
  const res = await fetch(`${base}/causas/buscar`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ rut }),
    redirect: "error",
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    throw new Error(`Scraper buscar RUT HTTP ${res.status}`);
  }
  const data = z
    .object({
      causas: z
        .array(
          z.object({
            rit: z.string().min(1).max(100),
            tribunal: z.string().min(1).max(255),
            caratula: z.string().max(2000).optional().nullable(),
            ruc: z.string().max(100).optional().nullable(),
            estado: z.string().max(200).optional().nullable(),
          })
        )
        .max(2000),
    })
    .parse(await res.json());
  return data.causas;
}
