import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth/session";
import { formatDateTime } from "@/components/ui";
import { ModuleHeader } from "@/components/sites/SiteNav";
import {
  labelAuditAction,
  labelAuditEntity,
  summarizeAuditJson,
} from "@/lib/audit-labels";
import { EmptyState } from "@/components/EmptyState";

type Props = {
  searchParams: Promise<{ action?: string; actor?: string; q?: string }>;
};

export default async function AuditoriaPage({ searchParams }: Props) {
  await requireStaff();
  const sp = await searchParams;
  const actionFilter = (sp.action || "").trim();
  const actorFilter = (sp.actor || "").trim();
  const q = (sp.q || "").trim().toLowerCase();

  const [events, actors] = await Promise.all([
    prisma.auditEvent.findMany({
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.user.findMany({
      where: { role: { not: "cliente" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const actionOptions = Array.from(new Set(events.map((e) => e.action))).sort();

  const filtered = events.filter((event) => {
    if (actionFilter && event.action !== actionFilter) return false;
    if (actorFilter && event.actorId !== actorFilter) return false;
    if (q) {
      const hay = [
        event.action,
        event.entityType,
        event.entityId || "",
        event.actor?.name || "",
        event.actor?.email || "",
        event.afterJson || "",
        event.beforeJson || "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Seguridad"
        title="Auditoría"
        subtitle="Eventos relevantes de causas, plazos, minutas, personas y configuración."
      />

      <form className="panel flex flex-wrap items-end gap-3 rounded-3xl p-4" method="get">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--ink-soft)]/65">Acción</span>
          <select className="select" name="action" defaultValue={actionFilter}>
            <option value="">Todas</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>
                {labelAuditAction(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-[var(--ink-soft)]/65">Actor</span>
          <select className="select" name="actor" defaultValue={actorFilter}>
            <option value="">Todos</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[200px] flex-1 text-sm">
          <span className="mb-1 block text-xs text-[var(--ink-soft)]/65">Buscar</span>
          <input
            className="input"
            name="q"
            defaultValue={sp.q || ""}
            placeholder="email, entidad, detalle…"
          />
        </label>
        <button className="btn btn-primary" type="submit">
          Filtrar
        </button>
        <Link href="/auditoria" className="btn btn-ghost">
          Limpiar
        </Link>
      </form>

      {filtered.length === 0 ? (
        <EmptyState
          title="Sin eventos"
          description="No hay registros de auditoría con estos filtros."
          actionLabel="Limpiar filtros"
          actionHref="/auditoria"
        />
      ) : (
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
              {filtered.map((event) => (
                <tr key={event.id} className="table-row align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDateTime(event.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {event.actor?.name || event.actor?.email || "Sistema"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{labelAuditAction(event.action)}</div>
                    <div className="text-xs text-[var(--ink-soft)]/60">{event.action}</div>
                  </td>
                  <td className="px-4 py-3">
                    {labelAuditEntity(event.entityType)}
                    {event.entityId ? (
                      <div className="text-xs text-[var(--ink-soft)]/60">{event.entityId}</div>
                    ) : null}
                  </td>
                  <td className="max-w-md px-4 py-3 text-[var(--ink-soft)]/85">
                    {summarizeAuditJson(event.afterJson || event.beforeJson)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
