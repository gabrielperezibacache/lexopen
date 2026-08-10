import { createHash } from "crypto";
import { classifyMovimiento } from "@/lib/pjud/classify";

export type PjudFetchedMovimiento = {
  externalId: string;
  titulo: string;
  detalle?: string | null;
  fecha: Date;
  referencia?: string | null;
  tipo?: string;
  relevante?: boolean;
  fuente: "pjud" | "demo";
};

export type PjudCausaRef = {
  id: string;
  rit: string | null;
  ruc: string | null;
  tribunal: string;
  titulo: string;
  caratula: string | null;
};

export type PjudFetchResult = {
  provider: "api" | "demo" | "none";
  movimientos: PjudFetchedMovimiento[];
  note: string;
  demo: boolean;
};

function fingerprint(titulo: string, fecha: Date, referencia?: string | null) {
  const raw = `${titulo.trim().toLowerCase()}|${fecha.toISOString().slice(0, 10)}|${referencia || ""}`;
  return createHash("sha1").update(raw).digest("hex").slice(0, 24);
}

/**
 * Proveedor partner/API (OpenAPI-compatible esperado).
 * Env: PJUD_API_URL, PJUD_API_KEY
 * Contrato: GET {PJUD_API_URL}/causas/lookup?rit=&tribunal=
 * Response: { movimientos: [{ id, titulo, detalle?, fecha, referencia? }] }
 */
async function fetchFromPartnerApi(causa: PjudCausaRef): Promise<PjudFetchResult | null> {
  const base = process.env.PJUD_API_URL?.replace(/\/$/, "");
  if (!base) return null;

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
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    throw new Error(`Proveedor PJUD HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    movimientos?: Array<{
      id?: string;
      titulo: string;
      detalle?: string;
      fecha: string;
      referencia?: string;
    }>;
  };

  const movimientos = (data.movimientos || []).map((m) => {
    const fecha = new Date(m.fecha);
    const classified = classifyMovimiento(m.titulo, m.detalle);
    return {
      externalId: m.id || fingerprint(m.titulo, fecha, m.referencia),
      titulo: m.titulo,
      detalle: m.detalle || null,
      fecha,
      referencia: m.referencia || null,
      tipo: classified.tipo,
      relevante: classified.relevante,
      fuente: "pjud" as const,
    };
  });

  return {
    provider: "api",
    movimientos,
    note: `Sincronizado vía proveedor PJUD (${movimientos.length} ítems).`,
    demo: false,
  };
}

/**
 * Simulador etiquetado (CaseTracking-like UX sin scrapear ofpj.pjud.cl).
 * Solo si PJUD_ALLOW_DEMO=1 o desarrollo.
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
  const samples = [
    {
      titulo: "Proveído: téngase por presentada demanda",
      detalle: `Ingreso en ${causa.tribunal}. Carátula: ${causa.caratula || causa.titulo}.`,
      fecha: day(18),
      referencia: `${rit}-P1`,
    },
    {
      titulo: "Resolución: tiene por interpuesta demanda y confiere traslado",
      detalle: "Plazo de 15 días hábiles para contestar.",
      fecha: day(14),
      referencia: `${rit}-R1`,
    },
    {
      titulo: "Certificado de notificación a demandado",
      detalle: "Notificación por cédula en domicilio registrado.",
      fecha: day(9),
      referencia: `${rit}-N1`,
    },
    {
      titulo: "Escrito: contestación de la demanda",
      detalle: "Parte demandada acompaña documentos.",
      fecha: day(4),
      referencia: `${rit}-E1`,
    },
    {
      titulo: "Citación a audiencia de conciliación",
      detalle: "Audiencia fijada en sala del tribunal.",
      fecha: day(1),
      referencia: `${rit}-A1`,
    },
  ];

  const movimientos = samples.map((m) => {
    const classified = classifyMovimiento(m.titulo, m.detalle);
    return {
      externalId: fingerprint(m.titulo, m.fecha, m.referencia),
      titulo: m.titulo,
      detalle: m.detalle,
      fecha: m.fecha,
      referencia: m.referencia,
      tipo: classified.tipo,
      relevante: classified.relevante,
      fuente: "demo" as const,
    };
  });

  return {
    provider: "demo",
    movimientos,
    note:
      "⚠ Modo demo: movimientos simulados para UX de monitoreo. No son datos oficiales del PJUD. Configure PJUD_API_URL para un conector real.",
    demo: true,
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

export async function fetchPjudMovimientos(
  causa: PjudCausaRef
): Promise<PjudFetchResult> {
  const fromApi = await fetchFromPartnerApi(causa);
  if (fromApi) return fromApi;

  if (pjudDemoAllowed()) {
    return fetchDemoMovimientos(causa);
  }

  return {
    provider: "none",
    movimientos: [],
    note:
      "Sin proveedor PJUD configurado (PJUD_API_URL). Active PJUD_ALLOW_DEMO=1 solo para simulación etiquetada, o conecte un partner API.",
    demo: false,
  };
}

export { fingerprint };
