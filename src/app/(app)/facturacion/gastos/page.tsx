import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { clp } from "@/lib/billing";
import { formatDate } from "@/components/ui";
import { ExpenseForm } from "@/components/billing/ExpenseForm";

export default async function GastosPage() {
  const [expenses, causas, clientes] = await Promise.all([
    prisma.expense.findMany({
      include: { author: true, causa: true, cliente: true },
      orderBy: { date: "desc" },
    }),
    prisma.causa.findMany({ select: { id: true, titulo: true, rit: true, clienteId: true } }),
    prisma.cliente.findMany({ select: { id: true, razonSocial: true } }),
  ]);

  const unbilled = expenses.filter((e) => e.billable && !e.billed);
  const total = unbilled.reduce((s, e) => s + e.amountClp, 0);

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Disbursements"
        title="Gastos"
        subtitle="Notaría, receptor, peritos, costas y otros desembolsos por cuenta del cliente."
      />
      <div className="panel rounded-3xl p-4 text-sm">
        Gastos por facturar: <strong>{clp(total)}</strong> ({unbilled.length} ítems)
      </div>
      <ExpenseForm causas={causas} clientes={clientes} />
      <div className="panel overflow-hidden rounded-3xl">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--ink)] text-white/90">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Causa / Cliente</th>
              <th className="px-4 py-3">Monto</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="table-row">
                <td className="px-4 py-3">{formatDate(e.date)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{e.description}</div>
                  {e.vendor && <div className="text-xs text-[var(--ink-soft)]/60">{e.vendor}</div>}
                </td>
                <td className="px-4 py-3">{e.category}</td>
                <td className="px-4 py-3">
                  {e.causa?.rit || e.cliente?.razonSocial || "—"}
                </td>
                <td className="px-4 py-3">{clp(e.amountClp)}</td>
                <td className="px-4 py-3">
                  {e.billed ? "Facturado" : e.billable ? "Por facturar" : "Interno"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
