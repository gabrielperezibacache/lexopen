import { createHash } from "crypto";

export type PjudFetchedMovimiento = {
  externalId: string;
  /** Previous scrape fingerprint, usable only when the stored cuaderno matches. */
  legacyExternalId?: string;
  titulo: string;
  detalle?: string | null;
  fecha: Date;
  referencia?: string | null;
  tipo?: string;
  relevante?: boolean;
  fuente: "pjud" | "demo";
  cuaderno?: string | null;
  folio?: string | null;
  etapa?: string | null;
  tramite?: string | null;
  esReceptor?: boolean;
  pendienteResolucion?: boolean;
  documentoRef?: string | null;
  /**
   * Ephemeral PDF/DOC bytes captured during Playwright scrape (session cookies).
   * Not serialized over HTTP; consumed by sync → Documento LexOpen.
   */
  documentoBytes?: Buffer | null;
  documentoFilename?: string | null;
};

export type PjudCausaRef = {
  id: string;
  rit: string | null;
  ruc: string | null;
  tribunal: string;
  titulo: string;
  caratula: string | null;
};

/** Coverage of the cuadernos listed by OJV, without session values or URLs. */
export type PjudCuadernosCoverage = {
  status: "complete" | "partial" | "unknown";
  total: number | null;
  read: number;
  items: Array<{
    key: string;
    label: string;
    status: "ok" | "failed";
    count: number;
    note?: string;
  }>;
};

export type PjudFetchResult = {
  provider: "api" | "demo" | "none" | "scrape" | "scrape-sidecar";
  movimientos: PjudFetchedMovimiento[];
  note: string;
  demo: boolean;
  sala?: string | null;
  resolvedTribunal?: string | null;
  cuadernos?: PjudCuadernosCoverage;
};

export type MisCausasItem = {
  rit: string;
  tribunal: string;
  caratula?: string | null;
  ruc?: string | null;
  estado?: string | null;
};

export function fingerprint(
  titulo: string,
  fecha: Date,
  referencia?: string | null
) {
  const raw = `${titulo.trim().toLowerCase()}|${fecha.toISOString().slice(0, 10)}|${referencia || ""}`;
  return createHash("sha1").update(raw).digest("hex").slice(0, 24);
}

export function normalizePjudCuaderno(value?: string | null): string | null {
  const normalized = (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().replace(/\s+/g, " ").toLowerCase();
  return !normalized || /^(?:sin cuaderno|desconocido|no identificado|por identificar|cuaderno)$/.test(normalized)
    ? null : normalized;
}

/** Versioned scrape identity; a known cuaderno separates otherwise identical folios. */
export function scrapeMovimientoIdentity(
  titulo: string,
  fecha: Date,
  folio?: string | null,
  cuaderno?: string | null
): Pick<PjudFetchedMovimiento, "externalId" | "legacyExternalId"> {
  const legacyExternalId = `scrape:${fingerprint(titulo, fecha, folio)}`;
  const normalized = normalizePjudCuaderno(cuaderno);
  if (!normalized) return { externalId: legacyExternalId };
  const raw = JSON.stringify([titulo.trim().toLowerCase(), fecha.toISOString().slice(0, 10), folio || "", normalized]);
  return {
    externalId: `scrape:v2:${createHash("sha1").update(raw).digest("hex").slice(0, 24)}`,
    legacyExternalId,
  };
}

/** Unscoped legacy copies cannot add flags or PDFs to an identified cuaderno. */
export function omitLegacyScrapeAliases(movimientos: PjudFetchedMovimiento[]) {
  const superseded = new Set(movimientos.filter((movement) =>
    /^scrape:v2:[a-f0-9]{24}$/.test(movement.externalId) &&
    movement.legacyExternalId && normalizePjudCuaderno(movement.cuaderno)
  ).map((movement) => movement.legacyExternalId!));
  return movimientos.filter((movement) => !superseded.has(movement.externalId));
}
