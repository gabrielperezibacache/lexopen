/**
 * Export helpers for external DTE / billing providers.
 * LexOpen invoices remain internal control docs — not SII electronic DTEs.
 */

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

function csvEscape(value: string | number) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function xmlEscape(value: string | number) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoDate(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
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
    fechaEmision: isoDate(inv.issueDate),
    fechaVencimiento: isoDate(inv.dueDate),
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
  const lines = [
    CSV_HEADERS.join(","),
    ...rows.map((row) => CSV_HEADERS.map((h) => csvEscape(row[h])).join(",")),
  ];
  return `${lines.join("\n")}\n`;
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
<lexopenExport version="1" nota="Control interno LexOpen — no es DTE SII; use un facturador externo certificado.">
${body}
</lexopenExport>
`;
}
