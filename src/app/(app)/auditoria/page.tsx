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
  const { dict, locale } = await getI18n();
  const h = dict.hubs.auditoria;
  const english = locale === "en";
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

      <form className="panel space-y-3 rounded-3xl p-4" method="get">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-auto text-sm">
            <span className="mb-1.5 block font-medium">{english ? "Search the audit log" : "Buscar en el historial"}</span>
            <input className="input" name="q" defaultValue={sp.q || ""} placeholder={english ? "Email, record or detail…" : "Correo, entidad o detalle…"} />
          </label>
          <button className="btn btn-primary" type="submit">{english ? "Filter" : "Filtrar"}</button>
          {(actionFilter || actorFilter || q) && (
            <Link href="/auditoria" className="btn btn-ghost">{english ? "Clear filters" : "Limpiar filtros"}</Link>
          )}
        </div>
        <details open={Boolean(actionFilter || actorFilter)}>
          <summary className="cursor-pointer py-2 text-sm font-medium">{english ? "Filter by action or user" : "Filtrar por acción o usuario"}</summary>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>{english ? "Action" : "Acción"}
              <select className="select" name="action" defaultValue={actionFilter}>
                <option value="">{english ? "All actions" : "Todas las acciones"}</option>
                {actionOptions.map(a => <option key={a} value={a}>{labelAuditAction(a)}</option>)}
              </select>
            </label>
            <label>{english ? "User" : "Usuario"}
              <select className="select" name="actor" defaultValue={actorFilter}>
                <option value="">{english ? "All users" : "Todos los usuarios"}</option>
                {actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          </div>
        </details>
      </form>

      <ListPagination path="/auditoria" filters={{ action: actionFilter, actor: actorFilter, q }} after={sp.after} next={next} count={filtered.length} />
      {filtered.length === 0 ? (
        <EmptyState
          title={english ? "No events" : "Sin eventos"}
          description={english ? "There are no audit events for this view." : "No hay eventos de auditoría en esta vista."}
        />
      ) : (
        <div className="panel overflow-hidden rounded-3xl">
          <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="table-heading">
              <tr>
                <th className="px-4 py-3">{english ? "Date" : "Fecha"}</th>
                <th className="px-4 py-3">{english ? "User" : "Usuario"}</th>
                <th className="px-4 py-3">{english ? "Action" : "Acción"}</th>
                <th className="px-4 py-3">{english ? "Entity" : "Entidad"}</th>
                <th className="px-4 py-3">{english ? "Detail" : "Detalle"}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((event) => (
                <tr key={event.id} className="table-row align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDateTime(event.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {event.actor?.name || event.actor?.email || (english ? "System" : "Sistema")}
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
