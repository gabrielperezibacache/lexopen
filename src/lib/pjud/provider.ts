import { createHash } from "crypto";
import { parseLocalDateInput } from "@/lib/minutas";
import { classifyMovimiento } from "@/lib/pjud/classify";
import { z } from "zod";

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
      movimientos: z
        .array(
          z.object({
            id: z.string().max(255).optional(),
            titulo: z.string().trim().min(1).max(2000),
            detalle: z.string().max(20_000).optional(),
            fecha: z.string().min(1).max(100),
            referencia: z.string().max(500).optional(),
          })
        )
        .max(5000)
        .optional(),
    })
    .passthrough()
    .parse(JSON.parse(responseText));

  const movimientos = (data.movimientos || []).map((m) => {
    const fecha = parseLocalDateInput(m.fecha);
    if (!fecha) throw new Error(`Fecha PJUD inválida: ${m.fecha}`);
    const classified = classifyMovimiento(m.titulo, m.detalle);
    return {
      externalId: m.id
        ? `pjud:${m.id}`
        : `pjud:${fingerprint(m.titulo, fecha, m.referencia)}`,
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
      externalId: `demo:${fingerprint(m.titulo, m.fecha, m.referencia)}`,
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
