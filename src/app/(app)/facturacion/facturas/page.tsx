import Link from "next/link";
import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import {
  DOC_TIPOS,
  INVOICE_STATUSES,
  OPEN_INVOICE_STATUSES,
  clp,
  docTipoFilter,
  invoiceListWhere,
  invoiceStatusFilter,
  labelDocTipo,
  labelExpenseCategory,
  labelInvoiceStatus,
} from "@/lib/billing";
import { formatCivilDate } from "@/lib/chile-time";
import { CreateInvoicePanel } from "@/components/billing/CreateInvoicePanel";
import { InvoiceStatusPill } from "@/components/billing/InvoiceStatusPill";
import { requireStaff } from "@/lib/auth/session";

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; tipo?: string }>;
}) {
  await requireStaff();
  const sp = await searchParams;
  const estado = invoiceStatusFilter(sp.estado);
  const tipo = docTipoFilter(sp.tipo);
  const where = invoiceListWhere(estado, tipo);

  const exportQuery = new URLSearchParams();
  if (estado) exportQuery.set("status", estado);
  if (tipo) exportQuery.set("tipo", tipo);
  const exportSuffix = exportQuery.size ? `&${exportQuery.toString()}` : "";

  const [invoices, unbilledTime, unbilledExpenses, clientes, causas, firm] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { cliente: true, causa: true },
      orderBy: { issueDate: "desc" },
    }),
    prisma.timeEntry.findMany({
      where: { billable: true, billed: false },
      include: { causa: true },
      orderBy: { date: "desc" },
    }),
    prisma.expense.findMany({
      where: { billable: true, billed: false },
      include: { causa: true },
      orderBy: { date: "desc" },
    }),
    prisma.cliente.findMany({ select: { id: true, razonSocial: true }, orderBy: { razonSocial: "asc" } }),
    prisma.causa.findMany({ select: { id: true, titulo: true, rit: true, clienteId: true } }),
    prisma.firmSettings.findFirst({ select: { ivaPct: true, defaultRetencionPct: true } }),
  ]);

  const saldoVista = invoices.reduce((sum, inv) => {
    const exigible =
      Boolean(estado) || (OPEN_INVOICE_STATUSES as readonly string[]).includes(inv.status);
    if (!exigible) return sum;
    return sum + Math.max(0, inv.totalClp - inv.paidClp);
  }, 0);

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Documentos internos"
        title="Facturas y boletas"
        subtitle="Boleta de honorarios, factura afecta o exenta y nota de crédito, con IVA y retención de Chile. El CSV/XML alimenta un facturador externo: LexOpen no emite DTE del SII."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/api/billing/invoices/export?format=csv${exportSuffix}`} className="btn btn-secondary">
              Exportar CSV
            </Link>
            <Link href={`/api/billing/invoices/export?format=xml${exportSuffix}`} className="btn btn-ghost">
              Exportar XML
            </Link>
          </div>
        }
      />

      <CreateInvoicePanel
        clientes={clientes}
        causas={causas}
        ivaRate={firm?.ivaPct}
        retencionRate={firm?.defaultRetencionPct}
        timeEntries={unbilledTime.map((t) => ({
          id: t.id,
          label: `${t.hours}h · ${t.description} · ${t.causa?.rit || "—"}`,
          amountClp: t.amountClp,
          clienteId: t.clienteId,
          causaId: t.causaId,
        }))}
        expenses={unbilledExpenses.map((e) => ({
          id: e.id,
          label: `${labelExpenseCategory(e.category)} · ${e.description}`,
          amountClp: e.amountClp,
          clienteId: e.clienteId,
          causaId: e.causaId,
        }))}
      />

      <form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-[var(--ink-soft)]/60">
          Estado
          <select className="select" name="estado" defaultValue={estado}>
            <option value="">Todos</option>
            {INVOICE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {labelInvoiceStatus(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-[var(--ink-soft)]/60">
          Tipo
          <select className="select" name="tipo" defaultValue={tipo}>
            <option value="">Todos</option>
            {DOC_TIPOS.map((doc) => (
              <option key={doc.value} value={doc.value}>
                {doc.label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-secondary" type="submit">
          Filtrar
        </button>
        {(estado || tipo) && (
          <Link href="/facturacion/facturas" className="btn btn-ghost">
            Quitar filtro
          </Link>
        )}
      </form>

      <div className="panel rounded-3xl p-4 text-sm">
        {invoices.length} documento{invoices.length === 1 ? "" : "s"}
        {estado ? ` · ${labelInvoiceStatus(estado)}` : ""}
        {tipo ? ` · ${labelDocTipo(tipo)}` : ""}
        {" · "}
        {estado ? "saldo de esta vista" : "por cobrar en la vista"} <strong>{clp(saldoVista)}</strong>
        {(estado || tipo) && (
          <span className="mt-1 block text-[var(--ink-soft)]/65">
            El CSV y el XML exportan el mismo filtro.
          </span>
        )}
      </div>

      <div className="panel overflow-x-auto rounded-3xl">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--ink)] text-white/90">
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Emisión</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Pagado</th>
              <th className="px-4 py-3">Saldo</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-[var(--ink-soft)]/65" colSpan={8}>
                  {estado || tipo
                    ? "Ningún documento coincide con el filtro."
                    : "Sin boletas ni facturas. Agrupe horas y gastos con el panel de emisión."}
                </td>
              </tr>
            )}
            {invoices.map((inv) => (
              <tr key={inv.id} className="table-row">
                <td className="px-4 py-3">
                  <Link href={`/facturacion/facturas/${inv.id}`} className="font-medium text-[var(--sea)]">
                    {inv.number}
                  </Link>
                  <div className="text-xs text-[var(--ink-soft)]/60">{inv.causa?.rit || "—"}</div>
                </td>
                <td className="px-4 py-3">{inv.cliente.razonSocial}</td>
                <td className="px-4 py-3">{labelDocTipo(inv.tipoDocumento)}</td>
                <td className="px-4 py-3">{formatCivilDate(inv.issueDate)}</td>
                <td className="px-4 py-3">{clp(inv.totalClp)}</td>
                <td className="px-4 py-3">{clp(inv.paidClp)}</td>
                <td className="px-4 py-3">{clp(Math.max(0, inv.totalClp - inv.paidClp))}</td>
                <td className="px-4 py-3">
                  <InvoiceStatusPill status={inv.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
