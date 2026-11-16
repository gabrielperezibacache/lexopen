import type { Prisma } from "@prisma/client";
import { listCursorWhere, listWindow } from "@/lib/api/list-window";
import { ListPagination } from "@/components/ui/ListPagination";
import styles from "@/components/config/WorkspaceArea.module.css";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { formatDateTime } from "@/components/ui";
import { ModuleHeader } from "@/components/ui/PageHeader";
import {
  labelAuditAction,
  labelAuditEntity,
  summarizeAuditJson,
} from "@/lib/audit-labels";
import { EmptyState } from "@/components/ui/EmptyState";
import { getI18n } from "@/lib/i18n/server";

type Props = {
  searchParams: Promise<{ action?: string; actor?: string; q?: string; after?: string }>;
};

export default async function AuditoriaPage({ searchParams }: Props) {
  const user = await requireStaff();
  if (!can(user, "audit.read")) redirect("/cuenta#permisos");
  const { dict } = await getI18n();
  const h = dict.hubs.auditoria;
  const sp = await searchParams;
  const actionFilter = (sp.action || "").trim();
  const actorFilter = (sp.actor || "").trim();
  const q = (sp.q || "").trim().toLowerCase();

  const [eventRows, actors, actions] = await Promise.all([
    prisma.auditEvent.findMany({
      where: { AND: [listCursorWhere(sp.after, "createdAt"),
        ...(actionFilter ? [{ action: actionFilter }] : []), ...(actorFilter ? [{ actorId: actorFilter }] : []),
        ...(q ? [{ OR: ([...(["action", "entityType", "entityId", "afterJson", "beforeJson"] as const).map(field => ({ [field]: { contains: q, mode: "insensitive" as const } })), { actor: { name: { contains: q, mode: "insensitive" as const } } }, { actor: { email: { contains: q, mode: "insensitive" as const } } }] satisfies Prisma.AuditEventWhereInput[]) }] : [])] },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 101,
    }),
    prisma.user.findMany({
      where: { role: { not: "cliente" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.auditEvent.groupBy({ by: ["action"], orderBy: { action: "asc" } }),
  ]);

  const { items: filtered, next } = listWindow(eventRows, 100, "createdAt");
  const actionOptions = actions.map(row => row.action);

  return (
    <div className={`${styles.area} space-y-6`}>
      <ModuleHeader artwork="research" eyebrow={h.eyebrow} title={h.title} subtitle={h.subtitle} />

      <p className="text-sm text-[var(--ink-soft)]">
        Los filtros consultan todo el historial autorizado.
      </p>
      <form className="panel grid grid-cols-1 items-end gap-3 rounded-3xl p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr_auto_auto]" method="get">
        <label className="min-w-0 text-sm">
          <span className="mb-1.5 block font-medium text-[var(--ink-soft)]">Acción</span>
          <select className="select" name="action" defaultValue={actionFilter}>
            <option value="">Todas</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>
                {labelAuditAction(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-sm">
          <span className="mb-1.5 block font-medium text-[var(--ink-soft)]">Actor</span>
          <select className="select" name="actor" defaultValue={actorFilter}>
            <option value="">Todos</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-sm sm:col-span-2 xl:col-span-1">
          <span className="mb-1.5 block font-medium text-[var(--ink-soft)]">Buscar</span>
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

      <ListPagination path="/auditoria" filters={{ action: actionFilter, actor: actorFilter, q }} after={sp.after} next={next} count={filtered.length} />
      {filtered.length === 0 ? (
        <EmptyState
          title="Sin eventos"
          description="No hay registros de auditoría con estos filtros."
          actionLabel="Limpiar filtros"
          actionHref="/auditoria"
        />
      ) : (
        <div className="panel overflow-hidden rounded-3xl">
          <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="table-heading">
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
        </div>
      )}
    </div>
  );
}
