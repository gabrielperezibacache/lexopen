import Link from "next/link";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { CausaManageActions } from "@/components/CausaManageActions";
import { CausasFilters } from "@/components/CausasFilters";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge, formatDate } from "@/components/ui";
import { causaAccessWhere } from "@/lib/auth/causa-access";
import { requireStaff } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/rbac";
import { getCaseManagementMode, type CaseManagementMode } from "@/lib/causas/management-mode";
import { labelEtapa } from "@/lib/chile";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { causaOrigenWhere, labelPjudSyncStatus } from "@/lib/pjud/causa-origin";
import { PjudManagementNotice } from "./PjudManagementNotice";

export type CaseListSearchParams = {
  q?: string; materia?: string; estado?: string; origen?: string; monitoreo?: string; page?: string;
};
const PAGE_SIZE = 50;

/** Both workspaces read the same accessible matters; the connected view adds PJUD tools. */
export async function CaseListServer({ mode, searchParams }: { mode: CaseManagementMode; searchParams: Promise<CaseListSearchParams> }) {
  const user = await requireStaff();
  if (mode === "pjud_cl" && await getCaseManagementMode() !== "pjud_cl") return <PjudManagementNotice canConfigure={isAdmin(user)} />;
  const connected = mode === "pjud_cl", base = connected ? "/pjud" : "/causas";
  const { t, locale } = await getI18n(), tr = (es: string, en: string) => locale === "en" ? en : es;
  const sp = await searchParams;
  const q = sp.q?.trim(), materia = sp.materia?.trim();
  const origen = connected ? sp.origen?.trim() : undefined, monitoreo = connected ? sp.monitoreo?.trim() : undefined;
  const rawEstado = sp.estado, estado = !rawEstado ? "activa" : rawEstado === "all" ? "" : rawEstado;
  const requestedPage = Number(sp.page || 1), page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const where: Prisma.CausaWhereInput = { AND: [
    causaAccessWhere(user),
    q ? { OR: [{ titulo: { contains: q } }, { rit: { contains: q } }, { ruc: { contains: q } }, { caratula: { contains: q } }, { tribunal: { contains: q } }] } : {},
    materia ? { materia } : {}, estado ? { estado } : {},
    connected ? causaOrigenWhere(origen) as Prisma.CausaWhereInput : {},
    monitoreo === "on" ? { pjudMonitoreoActivo: true } : monitoreo === "off" ? { pjudMonitoreoActivo: false } : {},
  ] };
  const [total, causas] = await Promise.all([
    prisma.causa.count({ where }),
    prisma.causa.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE)), from = total ? (page - 1) * PAGE_SIZE + 1 : 0, to = Math.min(page * PAGE_SIZE, total);
  const filterQuery = new URLSearchParams();
  for (const [key, value] of [["q", q], ["materia", materia], ["estado", rawEstado], ["origen", origen], ["monitoreo", monitoreo]]) if (value) filterQuery.set(key!, value);
  const pageHref = (next: number) => { const params = new URLSearchParams(filterQuery); if (next > 1) params.set("page", String(next)); return params.size ? `${base}?${params}` : base; };
  const hasFilters = Boolean(q || materia || origen || monitoreo || rawEstado && rawEstado !== "activa");
  const situation = tr("Situación", "Status"), update = connected ? tr("Seguimiento", "Tracking") : tr("Actualización", "Updated"), options = tr("Opciones", "Options");
  return <div className="space-y-6" data-testid={connected ? "pjud-workspace" : "manual-cases-workspace"}>
    <PageHeader title={connected ? "PJUD · Chile" : tr("Causas", "Matters")} actions={connected ? <><Link className="btn btn-secondary" href="/causas/monitoreo#alta-rol">{tr("Consultar por RIT/ROL", "Search by RIT/ROL")}</Link><Link className="btn btn-primary" href="/causas/mis-causas">{tr("Ingresar con ClaveÚnica", "Sign in with ClaveÚnica")}</Link></> : <Link className="btn btn-primary" href="/causas/nueva"><Plus size={16} aria-hidden="true" />{t("causas.newCase")}</Link>} />
    <CausasFilters defaultEstado={estado} mode={mode} />
    {total > 0 && <p className="text-sm text-[var(--muted)]">{tr(`${from}–${to} de ${total} causas`, `${from}–${to} of ${total} matters`)}</p>}
    <div className="panel overflow-hidden rounded-[var(--radius-lg)]"><div className="overflow-x-auto"><table role="table" className="data-table min-w-full text-left text-sm">
      <thead className="border-b border-[var(--line)] text-[var(--muted)]"><tr role="row">
        {[t("causas.colCase"), situation, update, options].map(label => <th role="columnheader" scope="col" key={label} className="px-4 py-3 font-medium">{label}</th>)}
      </tr></thead>
      <tbody>{causas.map(causa => <tr role="row" className="table-row" key={causa.id}>
        <td role="cell" data-label={t("causas.colCase")} className="data-table-primary max-w-xl px-4 py-4"><Link className="font-medium hover:text-[var(--sea)]" href={`${base}/${encodeURIComponent(causa.id)}`}>{causa.titulo}</Link><p className="mt-1 text-xs text-[var(--muted)]">{causa.rit || tr("Sin referencia", "No reference")}{causa.tribunal ? ` · ${causa.tribunal}` : ""}</p></td>
        <td role="cell" data-label={situation} className="px-4 py-4"><StatusBadge estado={causa.estado} /><p className="mt-1 text-xs text-[var(--muted)]">{labelEtapa(causa.etapa)}</p></td>
        <td role="cell" data-label={update} className="px-4 py-4">{connected ? <>
          <span>{!causa.pjudMonitoreoActivo ? tr("Sin seguimiento", "Not tracked") : !causa.pjudLastSyncStatus || causa.pjudLastSyncStatus === "never" ? tr("Pendiente de primera consulta", "Awaiting first check") : causa.pjudLastSyncStatus === "ok" ? tr("Consulta actualizada", "Query updated") : labelPjudSyncStatus(causa.pjudLastSyncStatus)}</span>
          {causa.pjudLastSyncAt && <p className="mt-1 text-xs text-[var(--muted)]">{tr("Revisada", "Checked")} {formatDate(causa.pjudLastSyncAt)}</p>}
        </> : formatDate(causa.updatedAt)}</td>
        <td role="cell" data-label={options} className="data-table-actions px-4 py-4"><details><summary className="min-h-11 cursor-pointer py-3 text-[var(--sea)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sea)]">{options}</summary><CausaManageActions causaId={causa.id} titulo={causa.titulo} estado={causa.estado} isAdmin={isAdmin(user)} compact /></details></td>
      </tr>)}{causas.length === 0 && <tr role="row"><td role="cell" colSpan={4} className="px-4 py-10 text-center text-[var(--muted)]"><p>{hasFilters ? t("causas.empty") : t("causas.emptyActive")}</p><Link className="mt-3 inline-flex min-h-11 items-center text-[var(--sea)]" href={hasFilters ? base : connected ? "/causas/mis-causas" : "/causas/nueva"}>{hasFilters ? tr("Quitar filtros", "Clear filters") : connected ? tr("Conectar mis causas", "Connect my matters") : t("causas.emptyCreate")}</Link></td></tr>}</tbody>
    </table></div></div>
    {totalPages > 1 && <nav className="flex items-center justify-between gap-3 text-sm" aria-label={tr("Páginas de causas", "Matter pages")}>{page > 1 ? <Link className="min-h-11 py-3 text-[var(--sea)]" href={pageHref(page - 1)}>{t("causas.prevPage")}</Link> : <span />}{page < totalPages && <Link className="min-h-11 py-3 text-[var(--sea)]" href={pageHref(page + 1)}>{t("causas.nextPage")}</Link>}</nav>}
  </div>;
}
