import Link from "next/link";
import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { clp, DOC_TIPOS } from "@/lib/billing";
import { StatusBadge, formatDate } from "@/components/ui";
import { CreateInvoicePanel } from "@/components/billing/CreateInvoicePanel";

function labelDoc(tipo: string) {
  return DOC_TIPOS.find((d) => d.value === tipo)?.label || tipo;
}

export default async function FacturasPage() {
  const [invoices, unbilledTime, unbilledExpenses, clientes, causas] = await Promise.all([
    prisma.invoice.findMany({
      include: { cliente: true, causa: true, payments: true },
      orderBy: { issueDate: "desc" },
    }),
    prisma.timeEntry.findMany({
      where: { billable: true, billed: false },
      include: { causa: true, user: true },
      orderBy: { date: "desc" },
    }),
    prisma.expense.findMany({
      where: { billable: true, billed: false },
      include: { causa: true },
      orderBy: { date: "desc" },
    }),
    prisma.cliente.findMany({ select: { id: true, razonSocial: true } }),
    prisma.causa.findMany({ select: { id: true, titulo: true, rit: true, clienteId: true } }),
  ]);

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Billing documents"
        title="Facturas y boletas"
        subtitle="Boleta de honorarios, factura afecta/exenta y nota de crédito — con IVA y retención Chile."
      />

      <CreateInvoicePanel
        clientes={clientes}
        causas={causas}
        timeEntries={unbilledTime.map((t) => ({
          id: t.id,
          label: `${t.hours}h · ${t.description} · ${t.causa?.rit || "—"}`,
          amountClp: t.amountClp,
          clienteId: t.clienteId,
          causaId: t.causaId,
        }))}
        expenses={unbilledExpenses.map((e) => ({
          id: e.id,
          label: `${e.category} · ${e.description}`,
          amountClp: e.amountClp,
          clienteId: e.clienteId,
          causaId: e.causaId,
        }))}
      />

      <div className="panel overflow-hidden rounded-3xl">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--ink)] text-white/90">
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Emisión</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Pagado</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="table-row">
                <td className="px-4 py-3">
                  <Link href={`/facturacion/facturas/${inv.id}`} className="font-medium text-[var(--sea)]">
                    {inv.number}
                  </Link>
                  <div className="text-xs text-[var(--ink-soft)]/60">{inv.causa?.rit || "—"}</div>
                </td>
                <td className="px-4 py-3">{inv.cliente.razonSocial}</td>
                <td className="px-4 py-3">{labelDoc(inv.tipoDocumento)}</td>
                <td className="px-4 py-3">{formatDate(inv.issueDate)}</td>
                <td className="px-4 py-3">{clp(inv.totalClp)}</td>
                <td className="px-4 py-3">{clp(inv.paidClp)}</td>
                <td className="px-4 py-3">
                  <StatusBadge
                    estado={
                      inv.status === "pagada"
                        ? "cumplido"
                        : inv.status === "vencida" || inv.status === "anulada"
                          ? "vencido"
                          : "pendiente"
                    }
                  />
                  <div className="mt-1 text-xs text-[var(--ink-soft)]/60">{inv.status}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
