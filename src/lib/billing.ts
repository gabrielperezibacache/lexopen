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

/** Documentos con saldo exigible. Borrador y anulada no entran en «por cobrar». */
export const OPEN_INVOICE_STATUSES = ["emitida", "parcialmente_pagada", "vencida"] as const;

const INVOICE_STATUS_LABEL: Record<(typeof INVOICE_STATUSES)[number], string> = {
  borrador: "Borrador",
  emitida: "Emitida",
  parcialmente_pagada: "Parcialmente pagada",
  pagada: "Pagada",
  vencida: "Vencida",
  anulada: "Anulada",
};

export const PAYMENT_METHODS = [
  { value: "transferencia", label: "Transferencia" },
  { value: "cheque", label: "Cheque" },
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "retencion", label: "Retención" },
] as const;

export const LEDGER_TIPOS = [
  { value: "provision", label: "Provisión" },
  { value: "cargo_honorario", label: "Cargo honorarios" },
  { value: "cargo_gasto", label: "Cargo gasto" },
  { value: "pago", label: "Pago" },
  { value: "ajuste", label: "Ajuste" },
  { value: "reembolso", label: "Reembolso" },
] as const;

export const LINE_TIPOS = [
  { value: "honorario", label: "Honorario" },
  { value: "gasto", label: "Gasto" },
  { value: "anticipo", label: "Anticipo" },
  { value: "otro", label: "Otro" },
] as const;

export const TIME_LIST_FILTERS = [
  { value: "por_facturar", label: "Por facturar" },
  { value: "facturado", label: "Facturado" },
  { value: "no_facturable", label: "No facturable" },
  { value: "por_aprobar", label: "Pendiente de aprobación" },
] as const;

export const EXPENSE_LIST_FILTERS = [
  { value: "por_facturar", label: "Por facturar" },
  { value: "facturado", label: "Facturado" },
  { value: "interno", label: "Interno" },
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
  }).format(Math.round(Number.isFinite(n) ? n : 0));
}

/** Horas con coma decimal chilena. Hasta 2 decimales para no redondear 0,25 h a 0,3 h. */
export function formatHours(hours: number) {
  const n = new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 2,
  }).format(Number.isFinite(hours) ? hours : 0);
  return `${n} h`;
}

export function formatUf(amount: number) {
  const n = new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 4,
  }).format(Number.isFinite(amount) ? amount : 0);
  return `${n} UF`;
}

/** Tasa fraccionaria (0,19) como porcentaje chileno. */
export function formatPercentRate(rate: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(rate) ? rate : 0);
}

function labelFrom(
  options: readonly { value: string; label: string }[],
  value: string | null | undefined
) {
  if (!value) return "—";
  return options.find((option) => option.value === value)?.label || value;
}

export function labelInvoiceStatus(status: string) {
  return INVOICE_STATUS_LABEL[status as (typeof INVOICE_STATUSES)[number]] || status;
}

export function invoiceStatusTone(status: string) {
  switch (status) {
    case "pagada":
      return "badge-activa";
    case "vencida":
      return "badge-vencido";
    case "emitida":
    case "parcialmente_pagada":
      return "badge-pendiente";
    default:
      return "badge-ink";
  }
}

export function canRegisterInvoicePayment(status: string, balanceClp: number) {
  return (
    balanceClp > 0 &&
    (OPEN_INVOICE_STATUSES as readonly string[]).includes(status)
  );
}

export function labelDocTipo(tipo: string) {
  return labelFrom(DOC_TIPOS, tipo);
}

export function labelFeeTipo(tipo: string) {
  return labelFrom(FEE_TIPOS, tipo);
}

export function labelExpenseCategory(category: string) {
  return labelFrom(EXPENSE_CATEGORIES, category);
}

export function labelActivity(code: string) {
  return labelFrom(ACTIVITY_CODES, code);
}

export function labelPaymentMethod(method: string) {
  return labelFrom(PAYMENT_METHODS, method);
}

export function labelLedgerTipo(tipo: string) {
  return labelFrom(LEDGER_TIPOS, tipo);
}

export function labelLineTipo(tipo: string) {
  return labelFrom(LINE_TIPOS, tipo);
}

export function labelTimeBillingState(entry: { billed: boolean; billable: boolean }) {
  if (entry.billed) return "Facturado";
  if (entry.billable) return "Por facturar";
  return "No facturable";
}

export function labelExpenseBillingState(entry: { billed: boolean; billable: boolean }) {
  if (entry.billed) return "Facturado";
  if (entry.billable) return "Por facturar";
  return "Interno";
}

export function labelApproval(approved: boolean) {
  return approved ? "Aprobada" : "Pendiente";
}

function knownValue<T extends string>(
  options: readonly { value: T }[],
  value: string | undefined | null
): T | "" {
  const found = options.find((option) => option.value === value);
  return found ? found.value : "";
}

export function timeListFilter(value: string | undefined | null) {
  return knownValue(TIME_LIST_FILTERS, value);
}

export function expenseListFilter(value: string | undefined | null) {
  return knownValue(EXPENSE_LIST_FILTERS, value);
}

export function invoiceStatusFilter(value: string | undefined | null) {
  return (INVOICE_STATUSES as readonly string[]).includes(value || "")
    ? (value as (typeof INVOICE_STATUSES)[number])
    : "";
}

export function docTipoFilter(value: string | undefined | null) {
  return knownValue(DOC_TIPOS, value);
}

export function timeEntryListWhere(estado: string | undefined | null) {
  switch (timeListFilter(estado)) {
    case "por_facturar":
      return { billable: true, billed: false };
    case "facturado":
      return { billed: true };
    case "no_facturable":
      return { billable: false };
    case "por_aprobar":
      return { approved: false, billed: false };
    default:
      return {};
  }
}

export function expenseListWhere(estado: string | undefined | null) {
  switch (expenseListFilter(estado)) {
    case "por_facturar":
      return { billable: true, billed: false };
    case "facturado":
      return { billed: true };
    case "interno":
      return { billable: false };
    default:
      return {};
  }
}

export function invoiceListWhere(estado?: string | null, tipo?: string | null) {
  const status = invoiceStatusFilter(estado);
  const tipoDocumento = docTipoFilter(tipo);
  return {
    ...(status ? { status } : {}),
    ...(tipoDocumento ? { tipoDocumento } : {}),
  };
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
