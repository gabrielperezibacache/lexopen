/**
 * Export helpers for external billing providers.
 * LexOpen invoices remain internal control docs — not SII electronic DTEs.
 */

import { civilDateKey } from "@/lib/chile-time";

export const CSV_UTF8_BOM = "\uFEFF";

/** Celda CSV segura para Excel (comillas y fórmulas). */
export function csvCell(value: string | number | boolean | null | undefined) {
  const raw = value == null ? "" : String(value);
  const guarded =
    typeof value === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

export function csvDocument(
  headers: readonly string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
) {
  const lines = [
    headers.map((header) => csvCell(header)).join(","),
    ...rows.map((row) => row.map((cell) => csvCell(cell)).join(",")),
  ];
  return `${CSV_UTF8_BOM}${lines.join("\n")}\n`;
}

export type BillingExportRow = {
  folioInterno: string;
  tipoDocumento: string;
  estado: string;
  fechaEmision: string;
  fechaVencimiento: string;
  rutEmisor: string;
  razonSocialEmisor: string;
  rutReceptor: string;
  razonSocialReceptor: string;
  netoClp: number;
  ivaClp: number;
  retencionClp: number;
  totalClp: number;
  pagadoClp: number;
  moneda: string;
  glosa: string;
  causaRit: string;
  notas: string;
};

export type BillingExportEmisor = {
  rut: string | null | undefined;
  razonSocial: string | null | undefined;
};

function xmlEscape(value: string | number) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Día civil en Chile (fecha-solo UTC se conserva; un timestamp usa America/Santiago). */
function exportDate(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return civilDateKey(date);
}

export function buildBillingExportRows(
  invoices: Array<{
    number: string;
    tipoDocumento: string;
    status: string;
    issueDate: Date | string;
    dueDate: Date | string | null;
    subtotalClp: number;
    ivaClp: number;
    retencionClp: number;
    totalClp: number;
    paidClp: number;
    currency: string;
    glosa: string | null;
    notes: string | null;
    cliente: { rut: string | null; razonSocial: string };
    causa: { rit: string | null } | null;
  }>,
  emisor: BillingExportEmisor
): BillingExportRow[] {
  return invoices.map((inv) => ({
    folioInterno: inv.number,
    tipoDocumento: inv.tipoDocumento,
    estado: inv.status,
    fechaEmision: exportDate(inv.issueDate),
    fechaVencimiento: exportDate(inv.dueDate),
    rutEmisor: emisor.rut || "",
    razonSocialEmisor: emisor.razonSocial || "Estudio LexOpen",
    rutReceptor: inv.cliente.rut || "",
    razonSocialReceptor: inv.cliente.razonSocial,
    netoClp: inv.subtotalClp,
    ivaClp: inv.ivaClp,
    retencionClp: inv.retencionClp,
    totalClp: inv.totalClp,
    pagadoClp: inv.paidClp,
    moneda: inv.currency || "CLP",
    glosa: inv.glosa || "",
    causaRit: inv.causa?.rit || "",
    notas: inv.notes || "",
  }));
}

const CSV_HEADERS: Array<keyof BillingExportRow> = [
  "folioInterno",
  "tipoDocumento",
  "estado",
  "fechaEmision",
  "fechaVencimiento",
  "rutEmisor",
  "razonSocialEmisor",
  "rutReceptor",
  "razonSocialReceptor",
  "netoClp",
  "ivaClp",
  "retencionClp",
  "totalClp",
  "pagadoClp",
  "moneda",
  "glosa",
  "causaRit",
  "notas",
];

export function billingExportToCsv(rows: BillingExportRow[]) {
  return csvDocument(
    CSV_HEADERS,
    rows.map((row) => CSV_HEADERS.map((header) => row[header]))
  );
}

export function billingExportToXml(rows: BillingExportRow[]) {
  const body = rows
    .map(
      (row) => `  <documento>
    <folioInterno>${xmlEscape(row.folioInterno)}</folioInterno>
    <tipoDocumento>${xmlEscape(row.tipoDocumento)}</tipoDocumento>
    <estado>${xmlEscape(row.estado)}</estado>
    <fechaEmision>${xmlEscape(row.fechaEmision)}</fechaEmision>
    <fechaVencimiento>${xmlEscape(row.fechaVencimiento)}</fechaVencimiento>
    <emisor>
      <rut>${xmlEscape(row.rutEmisor)}</rut>
      <razonSocial>${xmlEscape(row.razonSocialEmisor)}</razonSocial>
    </emisor>
    <receptor>
      <rut>${xmlEscape(row.rutReceptor)}</rut>
      <razonSocial>${xmlEscape(row.razonSocialReceptor)}</razonSocial>
    </receptor>
    <montos moneda="${xmlEscape(row.moneda)}">
      <netoClp>${row.netoClp}</netoClp>
      <ivaClp>${row.ivaClp}</ivaClp>
      <retencionClp>${row.retencionClp}</retencionClp>
      <totalClp>${row.totalClp}</totalClp>
      <pagadoClp>${row.pagadoClp}</pagadoClp>
    </montos>
    <glosa>${xmlEscape(row.glosa)}</glosa>
    <causaRit>${xmlEscape(row.causaRit)}</causaRit>
    <notas>${xmlEscape(row.notas)}</notas>
  </documento>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<lexopenExport version="1" zonaHoraria="America/Santiago" nota="Control interno LexOpen — no es DTE SII; use un facturador externo certificado.">
${body}
</lexopenExport>
`;
}
