import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import {
  TIME_LIST_FILTERS,
  clp,
  formatHours,
  labelActivity,
  labelApproval,
  labelTimeBillingState,
  timeEntryListWhere,
  timeListFilter,
} from "@/lib/billing";
import { formatCivilDate } from "@/lib/chile-time";
import { publicUserSelect } from "@/lib/auth/public-user";
import { TimeEntryForm } from "@/components/billing/TimeEntryForm";
import { TimeEntryActions } from "@/components/billing/TimeEntryActions";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";

export default async function HorasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  await requireStaff();
  const sp = await searchParams;
  const estado = timeListFilter(sp.estado);
  const estadoLabel = TIME_LIST_FILTERS.find((item) => item.value === estado)?.label;

  const [unbilled, entries, causas, clientes, users] = await Promise.all([
    prisma.timeEntry.aggregate({
      where: { billable: true, billed: false },
      _sum: { hours: true, amountClp: true },
      _count: true,
    }),
    prisma.timeEntry.findMany({
      where: timeEntryListWhere(estado),
      include: { user: { select: publicUserSelect }, causa: true, cliente: true },
      orderBy: { date: "desc" },
    }),
    prisma.causa.findMany({ select: { id: true, titulo: true, rit: true, clienteId: true } }),
    prisma.cliente.findMany({ select: { id: true, razonSocial: true } }),
    prisma.user.findMany({
      where: { role: { in: ["admin", "abogado", "asistente"] } },
      select: { id: true, name: true },
    }),
  ]);

  const exportHref = estado
    ? `/api/billing/time-entries?format=csv&estado=${estado}`
    : "/api/billing/time-entries?format=csv";

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Control de horas"
        title="Horas facturables"
        subtitle="Registro de tiempo por causa, actividad y tarifa. Listo para agrupar en boleta o factura."
        actions={
          <div className="flex flex-wrap gap-2">
            <a href={exportHref} className="btn btn-ghost">
              Exportar CSV
            </a>
            <Link href="/facturacion/facturas" className="btn btn-secondary">
              Facturar selección →
            </Link>
          </div>
        }
      />

      <form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-[var(--ink-soft)]/60">
          Estado
          <select className="select" name="estado" defaultValue={estado}>
            <option value="">Todos</option>
            {TIME_LIST_FILTERS.map((item) => (
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
          <Link href="/facturacion/horas" className="btn btn-ghost">
            Quitar filtro
          </Link>
        )}
      </form>

      <div className="panel rounded-3xl p-4 text-sm">
        Por facturar en el estudio:{" "}
        <strong>{formatHours(unbilled._sum.hours ?? 0)}</strong> ·{" "}
        <strong>{clp(unbilled._sum.amountClp ?? 0)}</strong>
        <span className="text-[var(--ink-soft)]/65"> ({unbilled._count} registros)</span>
        {estadoLabel && (
          <span className="mt-1 block text-[var(--ink-soft)]/65">
            La tabla muestra solo «{estadoLabel}». El total no cambia con el filtro.
          </span>
        )}
      </div>

      <TimeEntryForm causas={causas} clientes={clientes} users={users} />

      <div className="panel overflow-x-auto rounded-3xl">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--ink)] text-white/90">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3">Causa</th>
              <th className="px-4 py-3">Profesional</th>
              <th className="px-4 py-3">Horas</th>
              <th className="px-4 py-3">Monto</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Aprobación</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-[var(--ink-soft)]/65" colSpan={8}>
                  {estado
                    ? "Ninguna hora coincide con este estado."
                    : "Sin horas registradas. Use el formulario de arriba para cargar tiempo."}
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="table-row">
                <td className="px-4 py-3">{formatCivilDate(e.date)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{e.description}</div>
                  <div className="text-xs text-[var(--ink-soft)]/60">{labelActivity(e.activityCode)}</div>
                </td>
                <td className="px-4 py-3">{e.causa?.rit || e.causa?.titulo || "—"}</td>
                <td className="px-4 py-3">{e.user.name}</td>
                <td className="px-4 py-3">{formatHours(e.hours)}</td>
                <td className="px-4 py-3">{clp(e.amountClp)}</td>
                <td className="px-4 py-3">{labelTimeBillingState(e)}</td>
                <td className="px-4 py-3">
                  <div className="mb-2 text-xs text-[var(--ink-soft)]/65">{labelApproval(e.approved)}</div>
                  <TimeEntryActions id={e.id} approved={e.approved} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
