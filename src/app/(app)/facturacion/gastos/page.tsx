import Link from "next/link";
import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import {
  EXPENSE_LIST_FILTERS,
  clp,
  expenseListFilter,
  expenseListWhere,
  labelExpenseBillingState,
  labelExpenseCategory,
} from "@/lib/billing";
import { formatCivilDate } from "@/lib/chile-time";
import { ExpenseForm } from "@/components/billing/ExpenseForm";
import { requireStaff } from "@/lib/auth/session";

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  await requireStaff();
  const sp = await searchParams;
  const estado = expenseListFilter(sp.estado);
  const estadoLabel = EXPENSE_LIST_FILTERS.find((item) => item.value === estado)?.label;

  const [unbilled, expenses, causas, clientes] = await Promise.all([
    prisma.expense.aggregate({
      where: { billable: true, billed: false },
      _sum: { amountClp: true },
      _count: true,
    }),
    prisma.expense.findMany({
      where: expenseListWhere(estado),
      include: { causa: true, cliente: true },
      orderBy: { date: "desc" },
    }),
    prisma.causa.findMany({ select: { id: true, titulo: true, rit: true, clienteId: true } }),
    prisma.cliente.findMany({ select: { id: true, razonSocial: true } }),
  ]);

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Desembolsos"
        title="Gastos"
        subtitle="Notaría, receptor, peritos, costas y otros desembolsos por cuenta del cliente."
      />

      <form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-[var(--ink-soft)]/60">
          Estado
          <select className="select" name="estado" defaultValue={estado}>
            <option value="">Todos</option>
            {EXPENSE_LIST_FILTERS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-secondary" type="submit">
          Filtrar
        </button>
        {estado && (
          <Link href="/facturacion/gastos" className="btn btn-ghost">
            Quitar filtro
          </Link>
        )}
      </form>

      <div className="panel rounded-3xl p-4 text-sm">
        Gastos por facturar en el estudio: <strong>{clp(unbilled._sum.amountClp ?? 0)}</strong>{" "}
        <span className="text-[var(--ink-soft)]/65">({unbilled._count} ítems)</span>
        {estadoLabel && (
          <span className="mt-1 block text-[var(--ink-soft)]/65">
            La tabla muestra solo «{estadoLabel}». El total no cambia con el filtro.
          </span>
        )}
      </div>
      <ExpenseForm causas={causas} clientes={clientes} />
      <div className="panel overflow-x-auto rounded-3xl">
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
            {expenses.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-[var(--ink-soft)]/65" colSpan={6}>
                  {estado
                    ? "Ningún gasto coincide con este estado."
                    : "Sin gastos. Registre notaría, receptor u otros desembolsos arriba."}
                </td>
              </tr>
            )}
            {expenses.map((e) => (
              <tr key={e.id} className="table-row">
                <td className="px-4 py-3">{formatCivilDate(e.date)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{e.description}</div>
                  {e.vendor && <div className="text-xs text-[var(--ink-soft)]/60">{e.vendor}</div>}
                </td>
                <td className="px-4 py-3">{labelExpenseCategory(e.category)}</td>
                <td className="px-4 py-3">{e.causa?.rit || e.cliente?.razonSocial || "—"}</td>
                <td className="px-4 py-3">{clp(e.amountClp)}</td>
                <td className="px-4 py-3">{labelExpenseBillingState(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
