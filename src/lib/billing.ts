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

export const INVOICE_STATUSES = [
  "borrador",
  "emitida",
  "parcialmente_pagada",
  "pagada",
  "vencida",
  "anulada",
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
  /** Fraction, e.g. 0.19. Falls back to IVA_RATE. */
  ivaRate?: number;
  /** Fraction, e.g. 0.1375. Falls back to BOLETA_RETENCION_RATE. */
  retencionRate?: number;
}) {
  if (
    params.lines.length === 0 ||
    params.lines.some(
      (line) => !Number.isSafeInteger(line.amountClp) || line.amountClp < 0
    )
  ) {
    throw new RangeError("Las líneas de facturación deben tener montos CLP no negativos.");
  }
  const ivaRate =
    typeof params.ivaRate === "number" && Number.isFinite(params.ivaRate)
      ? params.ivaRate
      : IVA_RATE;
  const retencionRate =
    typeof params.retencionRate === "number" && Number.isFinite(params.retencionRate)
      ? params.retencionRate
      : BOLETA_RETENCION_RATE;
  const subtotalClp = params.lines.reduce((s, l) => s + l.amountClp, 0);
  let ivaClp = 0;
  let retencionClp = 0;
  let totalClp = subtotalClp;

  if (params.tipoDocumento === "factura_afecta") {
    ivaClp = Math.round(subtotalClp * ivaRate);
    totalClp = subtotalClp + ivaClp;
  } else if (params.tipoDocumento === "boleta_honorarios") {
    retencionClp = Math.round(subtotalClp * retencionRate);
    totalClp = subtotalClp - retencionClp;
  }

  return { subtotalClp, ivaClp, retencionClp, totalClp };
}

export function invoiceStatusAfterPayment(totalClp: number, paidClp: number) {
  if (
    !Number.isSafeInteger(totalClp) ||
    totalClp < 0 ||
    !Number.isSafeInteger(paidClp) ||
    paidClp < 0 ||
    paidClp > totalClp
  ) {
    throw new RangeError("El pago debe estar entre cero y el total de la factura.");
  }
  if (paidClp === totalClp) return "pagada";
  return paidClp > 0 ? "parcialmente_pagada" : "emitida";
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
