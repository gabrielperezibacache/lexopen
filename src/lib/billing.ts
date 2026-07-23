/** Utilidades de facturación / contabilidad para estudios en Chile */

export const IVA_RATE = 0.19;
/** Retención típica boleta de honorarios (aprox. 2ª categoría) — configurable */
export const BOLETA_RETENCION_RATE = 0.1375;

export const FEE_TIPOS = [
  { value: "hourly", label: "Por hora" },
  { value: "flat", label: "Suma alzada" },
  { value: "retainer", label: "Retainer / provisión" },
  { value: "cuota_litis", label: "Cuota litis (%)" },
  { value: "mixed", label: "Mixta" },
] as const;

export const DOC_TIPOS = [
  { value: "boleta_honorarios", label: "Boleta de honorarios" },
  { value: "factura_afecta", label: "Factura afecta (IVA)" },
  { value: "factura_exenta", label: "Factura exenta" },
  { value: "nota_credito", label: "Nota de crédito" },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: "notario", label: "Notaría" },
  { value: "receptor", label: "Receptor judicial" },
  { value: "perito", label: "Peritaje" },
  { value: "costas", label: "Costas / tasas" },
  { value: "traslado", label: "Traslado" },
  { value: "certificado", label: "Certificados" },
  { value: "otro", label: "Otro" },
] as const;

export const ACTIVITY_CODES = [
  { value: "drafting", label: "Redacción" },
  { value: "hearing", label: "Audiencia / tribunal" },
  { value: "research", label: "Investigación / jurisprudencia" },
  { value: "meeting", label: "Reunión cliente" },
  { value: "travel", label: "Traslado" },
  { value: "general", label: "General" },
] as const;

export function clp(n: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

export function computeInvoiceTotals(params: {
  tipoDocumento: string;
  lines: Array<{ amountClp: number }>;
}) {
  const subtotalClp = params.lines.reduce((s, l) => s + l.amountClp, 0);
  let ivaClp = 0;
  let retencionClp = 0;
  let totalClp = subtotalClp;

  if (params.tipoDocumento === "factura_afecta") {
    ivaClp = Math.round(subtotalClp * IVA_RATE);
    totalClp = subtotalClp + ivaClp;
  } else if (params.tipoDocumento === "boleta_honorarios") {
    retencionClp = Math.round(subtotalClp * BOLETA_RETENCION_RATE);
    totalClp = subtotalClp - retencionClp;
  }

  return { subtotalClp, ivaClp, retencionClp, totalClp };
}

export function nextInvoiceNumber(seq: number, tipo: string) {
  const year = new Date().getFullYear();
  const prefix =
    tipo === "factura_afecta"
      ? "FA"
      : tipo === "factura_exenta"
        ? "FE"
        : tipo === "nota_credito"
          ? "NC"
          : "BH";
  return `${prefix}-${year}-${String(seq).padStart(5, "0")}`;
}

export const DEFAULT_HOURLY_CLP = 120000;
