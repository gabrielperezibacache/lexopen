import { format } from "date-fns";
import { es } from "date-fns/locale";

/** Genera HTML imprimible / descargable como “PDF” interno (cuenta del estudio). */
export function renderInvoiceHtml(input: {
  number: string;
  tipoDocumento: string;
  issueDate: Date;
  dueDate?: Date | null;
  emisor: {
    razonSocial?: string | null;
    rut?: string | null;
    giro?: string | null;
    direccion?: string | null;
  };
  cliente: { razonSocial: string; rut?: string | null };
  causa?: { titulo: string; rit?: string | null } | null;
  lines: Array<{ description: string; quantity: number; unitAmountClp: number; amountClp: number }>;
  subtotalClp: number;
  ivaClp: number;
  retencionClp: number;
  totalClp: number;
  notes?: string | null;
  glosa?: string | null;
}) {
  const tipoLabel =
    input.tipoDocumento === "boleta_honorarios"
      ? "Boleta de honorarios (interna)"
      : input.tipoDocumento === "factura_afecta"
        ? "Factura afecta (interna)"
        : input.tipoDocumento;

  const rows = input.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.description)}</td><td style="text-align:right">${l.quantity}</td><td style="text-align:right">${clp(l.unitAmountClp)}</td><td style="text-align:right">${clp(l.amountClp)}</td></tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(input.number)}</title>
<style>
  body{font-family:Georgia,serif;color:#1a2420;margin:40px;background:#f7f3ea}
  h1{font-size:28px;margin:0}
  .muted{color:#5c6b66;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-top:24px}
  th,td{border-bottom:1px solid #d7d0c3;padding:8px;text-align:left;font-size:14px}
  .box{background:#fff;border:1px solid #d7d0c3;border-radius:16px;padding:24px}
  .tot{margin-top:16px;text-align:right;font-size:15px}
  .badge{display:inline-block;background:#1f6f78;color:#fff;padding:4px 10px;border-radius:999px;font-size:12px}
</style>
</head>
<body>
  <div class="box">
    <div class="badge">Cuenta interna LexOpen — no es DTE SII</div>
    <h1 style="margin-top:12px">${escapeHtml(tipoLabel)}</h1>
    <p class="muted">Nº ${escapeHtml(input.number)} · Emitida ${format(input.issueDate, "dd MMM yyyy", { locale: es })}${input.dueDate ? ` · Vence ${format(input.dueDate, "dd MMM yyyy", { locale: es })}` : ""}</p>
    <div style="display:flex;gap:32px;margin-top:20px">
      <div>
        <strong>Emisor</strong><br/>
        ${escapeHtml(input.emisor.razonSocial || "Estudio LexOpen")}<br/>
        ${input.emisor.rut ? `RUT ${escapeHtml(input.emisor.rut)}<br/>` : ""}
        ${input.emisor.giro ? `${escapeHtml(input.emisor.giro)}<br/>` : ""}
        ${input.emisor.direccion ? escapeHtml(input.emisor.direccion) : ""}
      </div>
      <div>
        <strong>Cliente</strong><br/>
        ${escapeHtml(input.cliente.razonSocial)}<br/>
        ${input.cliente.rut ? `RUT ${escapeHtml(input.cliente.rut)}` : ""}
        ${input.causa ? `<br/>Causa: ${escapeHtml(input.causa.rit || input.causa.titulo)}` : ""}
      </div>
    </div>
    ${input.glosa ? `<p style="margin-top:16px">${escapeHtml(input.glosa)}</p>` : ""}
    <table>
      <thead><tr><th>Detalle</th><th>Cant.</th><th>Unitario</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="tot">
      <div>Subtotal: ${clp(input.subtotalClp)}</div>
      ${input.ivaClp ? `<div>IVA: ${clp(input.ivaClp)}</div>` : ""}
      ${input.retencionClp ? `<div>Retención: ${clp(input.retencionClp)}</div>` : ""}
      <div><strong>Total: ${clp(input.totalClp)}</strong></div>
    </div>
    ${input.notes ? `<p class="muted" style="margin-top:20px">${escapeHtml(input.notes)}</p>` : ""}
  </div>
</body>
</html>`;
}

function clp(n: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
