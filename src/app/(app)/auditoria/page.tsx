import { prisma } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth/access";
import { formatDateTime } from "@/components/ui";
import { ModuleHeader } from "@/components/sites/SiteNav";

export default async function AuditoriaPage() {
  await requireStaffPage();
  const events = await prisma.auditEvent.findMany({
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Seguridad"
        title="Auditoría"
        subtitle="Eventos relevantes de causas, plazos, minutas y configuración."
      />
      <div className="panel overflow-hidden rounded-3xl">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--ink)] text-white/90">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Acción</th>
              <th className="px-4 py-3">Entidad</th>
              <th className="px-4 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="table-row align-top">
                <td className="px-4 py-3">{formatDateTime(event.createdAt)}</td>
                <td className="px-4 py-3">{event.actor?.name || event.actor?.email || "Sistema"}</td>
                <td className="px-4 py-3">{event.action}</td>
                <td className="px-4 py-3">
                  {event.entityType}
                  {event.entityId ? ` · ${event.entityId}` : ""}
                </td>
                <td className="max-w-md px-4 py-3">
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs">
                    {event.afterJson || event.beforeJson || "—"}
                  </pre>
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-[var(--ink-soft)]/65" colSpan={5}>
                  Sin eventos de auditoría.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
