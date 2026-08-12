import { createHash } from "crypto";

export type PjudFetchedMovimiento = {
  externalId: string;
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
  documentoRef?: string | null;
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
  provider: "api" | "demo" | "none" | "scrape" | "scrape-sidecar";
  movimientos: PjudFetchedMovimiento[];
  note: string;
  demo: boolean;
  sala?: string | null;
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
