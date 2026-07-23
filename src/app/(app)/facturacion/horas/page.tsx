import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { clp } from "@/lib/billing";
import { formatDate } from "@/components/ui";
import { TimeEntryForm } from "@/components/billing/TimeEntryForm";
import Link from "next/link";

export default async function HorasPage() {
  const [entries, causas, clientes, users] = await Promise.all([
    prisma.timeEntry.findMany({
      include: { user: true, causa: true, cliente: true },
      orderBy: { date: "desc" },
    }),
    prisma.causa.findMany({ select: { id: true, titulo: true, rit: true, clienteId: true } }),
    prisma.cliente.findMany({ select: { id: true, razonSocial: true } }),
    prisma.user.findMany({
      where: { role: { in: ["admin", "abogado", "asistente"] } },
      select: { id: true, name: true },
    }),
  ]);

  const unbilled = entries.filter((e) => e.billable && !e.billed);
  const unbilledTotal = unbilled.reduce((s, e) => s + e.amountClp, 0);

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Timekeeping"
        title="Horas facturables"
        subtitle="Registro de tiempo por causa, actividad y tarifa. Listo para agrupar en boleta/factura."
        actions={
          <Link href="/facturacion/facturas" className="btn btn-secondary">
            Facturar selección →
          </Link>
        }
      />

      <div className="panel rounded-3xl p-4 text-sm">
        Por facturar: <strong>{unbilled.reduce((s, e) => s + e.hours, 0).toFixed(1)} h</strong> ·{" "}
        <strong>{clp(unbilledTotal)}</strong>
      </div>

      <TimeEntryForm causas={causas} clientes={clientes} users={users} />

      <div className="panel overflow-hidden rounded-3xl">
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
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="table-row">
                <td className="px-4 py-3">{formatDate(e.date)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{e.description}</div>
                  <div className="text-xs text-[var(--ink-soft)]/60">{e.activityCode}</div>
                </td>
                <td className="px-4 py-3">{e.causa?.rit || e.causa?.titulo || "—"}</td>
                <td className="px-4 py-3">{e.user.name}</td>
                <td className="px-4 py-3">{e.hours}</td>
                <td className="px-4 py-3">{clp(e.amountClp)}</td>
                <td className="px-4 py-3">
                  {e.billed ? "Facturado" : e.billable ? "Por facturar" : "No facturable"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
