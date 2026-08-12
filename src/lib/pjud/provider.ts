import { parseLocalDateInput } from "@/lib/minutas";
import { classifyMovimiento } from "@/lib/pjud/classify";
import { captchaSolverConfigured } from "@/lib/pjud/captcha-solver";
import {
  publicScrapeEnabled,
  publicScrapeReady,
  scrapeCausaByRol,
} from "@/lib/pjud/public-scrape";
import { fetchFromScraperSidecar, scraperSidecarConfigured } from "@/lib/pjud/scraper-sidecar";
import {
  fingerprint,
  type PjudCausaRef,
  type PjudFetchResult,
  type PjudFetchedMovimiento,
} from "@/lib/pjud/types";
import { z } from "zod";

export type { PjudCausaRef, PjudFetchResult, PjudFetchedMovimiento };

const partnerMovementSchema = z.object({
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
  documentoUrl: z.string().max(500).optional().nullable(),
});

function mapPartnerMovement(
  m: z.infer<typeof partnerMovementSchema>,
  fuente: "pjud" | "demo"
): PjudFetchedMovimiento {
  const fecha = parseLocalDateInput(m.fecha);
  if (!fecha) throw new Error(`Fecha PJUD inválida: ${m.fecha}`);
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
      ? `${fuente === "demo" ? "demo" : "pjud"}:${m.id}`
      : `${fuente === "demo" ? "demo" : "pjud"}:${fingerprint(m.titulo, fecha, m.referencia)}`,
    titulo: m.titulo,
    detalle: m.detalle || null,
    fecha,
    referencia: m.referencia || null,
    tipo: classified.tipo,
    relevante: classified.relevante || esReceptor || pendienteResolucion,
    fuente,
    cuaderno: m.cuaderno || "Principal",
    folio: m.folio || null,
    etapa: m.etapa || null,
    tramite: m.tramite || null,
    esReceptor,
    pendienteResolucion,
    documentoRef: m.documentoRef || m.documentoUrl || null,
  };
}

/**
 * Proveedor partner/API (OpenAPI-compatible esperado).
 * Env: PJUD_API_URL, PJUD_API_KEY
 * Contrato: GET {PJUD_API_URL}/causas/lookup?rit=&tribunal=
 * Response: {
 *   sala?,
 *   movimientos: [{ id, titulo, detalle?, fecha, referencia?, cuaderno?, folio?,
 *                   etapa?, tramite?, esReceptor?, documentoRef? }]
 * }
 */
async function fetchFromPartnerApi(causa: PjudCausaRef): Promise<PjudFetchResult | null> {
  const rawBase = process.env.PJUD_API_URL?.trim();
  if (!rawBase) return null;
  const parsedBase = new URL(rawBase);
  if (
    (process.env.NODE_ENV === "production" && parsedBase.protocol !== "https:") ||
    (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:") ||
    parsedBase.username ||
    parsedBase.password ||
    (process.env.NODE_ENV === "production" &&
      isPrivateHostname(parsedBase.hostname))
  ) {
    throw new Error("PJUD_API_URL no cumple las restricciones de seguridad");
  }
  const base = parsedBase.toString().replace(/\/$/, "");

  const params = new URLSearchParams();
  if (causa.rit) params.set("rit", causa.rit);
  if (causa.ruc) params.set("ruc", causa.ruc);
  params.set("tribunal", causa.tribunal);

  const res = await fetch(`${base}/causas/lookup?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      ...(process.env.PJUD_API_KEY
        ? { Authorization: `Bearer ${process.env.PJUD_API_KEY}` }
        : {}),
    },
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    throw new Error(`Proveedor PJUD HTTP ${res.status}`);
  }

  const responseText = await res.text();
  if (responseText.length > 5 * 1024 * 1024) {
    throw new Error("La respuesta PJUD supera el límite permitido");
  }
  const data = z
    .object({
      sala: z.string().max(200).optional().nullable(),
      movimientos: z.array(partnerMovementSchema).max(5000).optional(),
    })
    .passthrough()
    .parse(JSON.parse(responseText));

  const movimientos = (data.movimientos || []).map((m) =>
    mapPartnerMovement(m, "pjud")
  );

  return {
    provider: "api",
    movimientos,
    note: `Sincronizado vía proveedor PJUD (${movimientos.length} ítems).`,
    demo: false,
    sala: data.sala || null,
  };
}

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "metadata.google.internal" ||
    host === "::1" ||
    host === "0.0.0.0"
  ) {
    return true;
  }
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

/**
 * Demo etiquetado con fidelidad CausaMonitor (cuadernos, receptor, escritos).
 * Solo si PJUD_ALLOW_DEMO=1 o desarrollo. No scrapea ofpj.pjud.cl.
 */
function fetchDemoMovimientos(causa: PjudCausaRef): PjudFetchResult {
  const now = new Date();
  const day = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    d.setHours(12, 0, 0, 0);
    return d;
  };

  const rit = causa.rit || "SIN-RIT";
  const samples: Array<{
    titulo: string;
    detalle: string;
    fecha: Date;
    referencia: string;
    cuaderno: string;
    folio: string;
    etapa?: string;
    tramite?: string;
    esReceptor?: boolean;
    documentoRef?: string;
  }> = [
    {
      titulo: "Proveído: téngase por presentada demanda",
      detalle: `Ingreso en ${causa.tribunal}. Carátula: ${causa.caratula || causa.titulo}.`,
      fecha: day(45),
      referencia: `${rit}-P1`,
      cuaderno: "Principal",
      folio: "1",
      etapa: "Ingreso",
      tramite: "Proveído",
    },
    {
      titulo: "Resolución: tiene por interpuesta demanda y confiere traslado",
      detalle: "Plazo de 15 días hábiles para contestar.",
      fecha: day(40),
      referencia: `${rit}-R1`,
      cuaderno: "Principal",
      folio: "3",
      etapa: "Traslado",
      tramite: "Resolución",
    },
    {
      titulo: "Notificación receptor: cédula a demandado",
      detalle: "Receptor judicial notifica por cédula en domicilio registrado.",
      fecha: day(35),
      referencia: `${rit}-NR1`,
      cuaderno: "Principal",
      folio: "5",
      etapa: "Notificación",
      tramite: "Cédula",
      esReceptor: true,
      documentoRef: `receptor/${rit}-NR1`,
    },
    {
      titulo: "Notificación receptor: segunda cédula",
      detalle: "Segunda diligencia de notificación en el mismo domicilio.",
      fecha: day(30),
      referencia: `${rit}-NR2`,
      cuaderno: "Principal",
      folio: "6",
      etapa: "Notificación",
      tramite: "Cédula",
      esReceptor: true,
    },
    {
      titulo: "Escrito: contestación de la demanda",
      detalle: "Parte demandada acompaña documentos y excepciones.",
      fecha: day(22),
      referencia: `${rit}-E1`,
      cuaderno: "Principal",
      folio: "8",
      etapa: "Contestación",
      tramite: "Escrito",
      documentoRef: `escrito/${rit}-E1`,
    },
    {
      titulo: "Citación a audiencia de conciliación",
      detalle: "Audiencia fijada en sala del tribunal.",
      fecha: day(14),
      referencia: `${rit}-A1`,
      cuaderno: "Principal",
      folio: "12",
      etapa: "Audiencia",
      tramite: "Citación",
    },
    {
      titulo: "Acta de audiencia de conciliación",
      detalle: "Sin acuerdo. Se ordena continuar el procedimiento.",
      fecha: day(10),
      referencia: `${rit}-A2`,
      cuaderno: "Principal",
      folio: "14",
      etapa: "Audiencia",
      tramite: "Acta",
    },
    {
      titulo: "Escrito: recurso de apelación",
      detalle: "Se deduce apelación contra resolución interlocutoria.",
      fecha: day(7),
      referencia: `${rit}-AP1`,
      cuaderno: "Apelación",
      folio: "1",
      etapa: "Apelación",
      tramite: "Escrito",
      documentoRef: `escrito/${rit}-AP1`,
    },
    {
      titulo: "Proveído: téngase por interpuesto recurso de apelación",
      detalle: "Se elevan autos a la Corte de Apelaciones.",
      fecha: day(4),
      referencia: `${rit}-AP2`,
      cuaderno: "Apelación",
      folio: "2",
      etapa: "Apelación",
      tramite: "Proveído",
    },
    {
      titulo: "Notificación receptor: resolución de elevación",
      detalle: "Receptor certifica notificación de la resolución que eleva la apelación.",
      fecha: day(1),
      referencia: `${rit}-NR3`,
      cuaderno: "Apelación",
      folio: "3",
      etapa: "Notificación",
      tramite: "Cédula",
      esReceptor: true,
    },
  ];

  const movimientos = samples.map((m) => {
    const classified = classifyMovimiento(m.titulo, m.detalle);
    return {
      externalId: `demo:${fingerprint(m.titulo, m.fecha, m.referencia)}`,
      titulo: m.titulo,
      detalle: m.detalle,
      fecha: m.fecha,
      referencia: m.referencia,
      tipo: classified.tipo,
      relevante: classified.relevante || Boolean(m.esReceptor),
      fuente: "demo" as const,
      cuaderno: m.cuaderno,
      folio: m.folio,
      etapa: m.etapa || null,
      tramite: m.tramite || null,
      esReceptor: Boolean(m.esReceptor),
      documentoRef: m.documentoRef || null,
    };
  });

  return {
    provider: "demo",
    movimientos,
    note:
      "⚠ Modo demo (paridad CausaMonitor): cuadernos, receptor y escritos simulados. No son datos oficiales del PJUD. Configure PJUD_API_URL para un conector real.",
    demo: true,
    sala: "Sala 1",
  };
}

export function pjudDemoAllowed() {
  if (process.env.PJUD_ALLOW_DEMO === "1") return true;
  if (process.env.PJUD_ALLOW_DEMO === "0") return false;
  return process.env.NODE_ENV !== "production";
}

export function pjudProviderConfigured() {
  return Boolean(process.env.PJUD_API_URL?.trim());
}

export function pjudLiveIngestConfigured() {
  return (
    pjudProviderConfigured() ||
    scraperSidecarConfigured() ||
    publicScrapeReady()
  );
}

export function pjudSyncIntervalMs() {
  // CausaMonitor Pro: actualización ~cada 4h. Default 240 min (antes 1440
  // anulaba el cron de cartera porque nextSyncAt quedaba a 24h).
  const raw = Number(process.env.PJUD_SYNC_INTERVAL_MINUTES || 240);
  const minutes =
    Number.isFinite(raw) && raw > 0 ? Math.min(raw, 60 * 24 * 14) : 240;
  return minutes * 60 * 1000;
}

export async function fetchPjudMovimientos(
  causa: PjudCausaRef
): Promise<PjudFetchResult> {
  // Self-hosted LexOpen: datos/vault en este host. APIs externas (OJV,
  // CAPTCHA, partner) están permitidas; no se usa un host SaaS ajeno.
  let sidecarError: Error | null = null;
  let scrapeError: Error | null = null;

  // 1) Sidecar en su despliegue (localhost / red privada)
  if (scraperSidecarConfigured()) {
    try {
      const fromSidecar = await fetchFromScraperSidecar(causa);
      if (fromSidecar) return fromSidecar;
    } catch (error) {
      sidecarError =
        error instanceof Error ? error : new Error(String(error));
      if (!publicScrapeReady() && !pjudProviderConfigured()) {
        if (pjudDemoAllowed() && process.env.NODE_ENV !== "production") {
          // fall through to demo in non-prod
        } else {
          throw sidecarError;
        }
      }
    }
  }

  // 2) Scrape OJV in-process (Playwright en este host; CAPTCHA = API externa OK)
  if (publicScrapeReady()) {
    try {
      const scraped = await scrapeCausaByRol(causa);
      return {
        provider: "scrape",
        movimientos: scraped.movimientos,
        note: scraped.note,
        demo: false,
        sala: scraped.sala,
      };
    } catch (error) {
      scrapeError = error instanceof Error ? error : new Error(String(error));
      if (!pjudProviderConfigured()) {
        if (sidecarError) {
          throw new Error(
            `Sidecar falló (${sidecarError.message}); scrape in-process también falló: ${scrapeError.message}`
          );
        }
        if (pjudDemoAllowed() && process.env.NODE_ENV !== "production") {
          // fall through
        } else {
          throw scrapeError;
        }
      }
    }
  }

  if (publicScrapeEnabled() && !captchaSolverConfigured() && !scraperSidecarConfigured()) {
    if (!pjudProviderConfigured()) {
      return {
        provider: "none",
        movimientos: [],
        note:
          "PJUD_PUBLIC_SCRAPE=1 pero falta CAPTCHA_SOLVER_PROVIDER/API_KEY (o PJUD_SCRAPER_URL local).",
        demo: false,
      };
    }
  }

  // 3) Partner API (externa, permitida — no es “host” de LexOpen)
  const fromApi = await fetchFromPartnerApi(causa);
  if (fromApi) {
    if (sidecarError || scrapeError) {
      const reasons = [
        sidecarError ? `sidecar: ${sidecarError.message}` : null,
        scrapeError ? `scrape: ${scrapeError.message}` : null,
      ]
        .filter(Boolean)
        .join("; ");
      return {
        ...fromApi,
        note: `${fromApi.note} · fallback partner tras fallo de sidecar/scrape (${reasons})`,
      };
    }
    return fromApi;
  }

  // 4) Demo etiquetado
  if (pjudDemoAllowed()) {
    const demo = fetchDemoMovimientos(causa);
    const prefix = [sidecarError, scrapeError]
      .filter(Boolean)
      .map((e) => (e as Error).message)
      .join("; ");
    if (prefix) {
      demo.note = `⚠ Sidecar/scrape falló (${prefix}). ${demo.note}`;
    }
    return demo;
  }

  return {
    provider: "none",
    movimientos: [],
    note: sidecarError
      ? `Sidecar falló: ${sidecarError.message}`
      : scrapeError
        ? `Scrape local falló: ${scrapeError.message}`
        : "Sin conector PJUD. Configure PJUD_SCRAPER_URL, PJUD_PUBLIC_SCRAPE=1+CAPTCHA, PJUD_API_URL (partner) o CSV. El host de LexOpen sigue siendo el suyo.",
    demo: false,
  };
}

export { fingerprint };
