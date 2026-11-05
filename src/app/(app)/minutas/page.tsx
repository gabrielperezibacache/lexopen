import { MinutaPlantillasManager } from "@/components/minutas/MinutaPlantillasManager";
import { formatDateTime } from "@/components/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { minutaConfidentialWhere } from "@/lib/api";
import { causaAccessWhere, requiredCausaWhere } from "@/lib/auth/causa-access";
import { can, canSome } from "@/lib/auth/permissions";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { ACCIONES_ABIERTAS, labelTipoMinuta } from "@/lib/minutas";
import { ChevronRight, Plus, Search } from "lucide-react";
import Link from "next/link";

type MinutasSearch = { nueva?: string | string[]; q?: string | string[] };

export default async function MinutasPage({ searchParams }: { searchParams: Promise<MinutasSearch> }) {
  const user = await requireStaff();
  const { dict, locale } = await getI18n();
  const tr = (es: string, en: string) => locale === "en" ? en : es;
  const query = await searchParams;
  const canCreate = canSome(user, "causa.write");
  const choosingCase = canCreate && query.nueva === "1";
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 160) : "";
  const canManageTemplates = user.role === "admin" || user.role === "abogado";
  const now = new Date();

  const [minutas, candidates, plantillas] = await Promise.all([
    prisma.minuta.findMany({
      where: { AND: [requiredCausaWhere(user), minutaConfidentialWhere(user)] },
      include: {
        causa: { select: { titulo: true, rit: true } },
        autor: { select: { name: true } },
        _count: { select: { acciones: { where: { estado: { in: [...ACCIONES_ABIERTAS] } } } } },
      },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
      take: 40,
    }),
    choosingCase ? prisma.causa.findMany({
      where: { AND: [
        causaAccessWhere(user),
        { estado: "activa" },
        search ? { OR: [
          { titulo: { contains: search, mode: "insensitive" } },
          { rit: { contains: search, mode: "insensitive" } },
          { ruc: { contains: search, mode: "insensitive" } },
        ] } : {},
      ] },
      select: {
        id: true, titulo: true, rit: true, ruc: true, abogadoId: true,
        miembros: {
          where: { userId: user.id, desde: { lte: now }, OR: [{ hasta: null }, { hasta: { gt: now } }] },
          select: { rol: true },
          take: 1,
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 30,
    }) : [],
    canManageTemplates ? prisma.minutaPlantilla.findMany({
      orderBy: [{ tipo: "asc" }, { nombre: "asc" }],
      take: 50,
    }) : [],
  ]);

  const causas = candidates.filter(causa => can(user, "causa.write", {
    causaRol: causa.miembros[0]?.rol ?? (causa.abogadoId === user.id ? "responsable" : null),
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title={dict.hubs.minutas.title}
        subtitle={tr(
          "Registra lo que ocurrió en una audiencia, reunión o llamada y deja los próximos pasos en el expediente.",
          "Record what happened at a hearing, meeting, or call and keep the next steps in its case file.",
        )}
        actions={canCreate && !choosingCase ? (
          <Link className="btn btn-primary" href="/minutas?nueva=1#nueva-minuta">
            <Plus size={16} aria-hidden="true" /> {tr("Nueva minuta", "New minute")}
          </Link>
        ) : undefined}
      />

      {choosingCase && (
        <section id="nueva-minuta" aria-labelledby="nueva-minuta-titulo" className="panel scroll-mt-24 rounded-[var(--radius-lg)] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="nueva-minuta-titulo" className="text-lg font-semibold">{tr("Elige una causa", "Choose a matter")}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{tr("La minuta se guardará en su expediente.", "The minute will be saved in its case file.")}</p>
            </div>
            <Link href="/minutas" className="btn btn-ghost">{tr("Cancelar", "Cancel")}</Link>
          </div>
          <form action="/minutas#nueva-minuta" className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="nueva" value="1" />
            <label className="min-w-0 flex-1 basis-48 text-sm font-medium">
              <span className="mb-1 block">{tr("Buscar causa", "Find matter")}</span>
              <input className="input" type="search" name="q" defaultValue={search} maxLength={160} placeholder={tr("Título o referencia", "Title or reference")} />
            </label>
            <button type="submit" className="btn btn-secondary">
              <Search size={16} aria-hidden="true" /> {tr("Buscar", "Search")}
            </button>
          </form>
          {causas.length > 0 ? (
            <ul className="mt-3 divide-y divide-[var(--line)]">
              {causas.map(causa => (
                <li key={causa.id}>
                  <Link className="flex min-h-11 items-center justify-between gap-3 py-3 hover:text-[var(--sea)]" href={`/causas/${causa.id}/minuta/nueva?desde=minutas`}>
                    <span className="min-w-0 break-words text-sm font-medium">
                      {causa.titulo}
                      {(causa.rit || causa.ruc) && <span className="mt-0.5 block text-xs text-[var(--muted)]">{causa.rit || causa.ruc}</span>}
                    </span>
                    <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-[var(--sea)]" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-[var(--muted)]">{tr(
              "No encontramos causas activas donde puedas registrar una minuta. Prueba otra búsqueda o revisa tus causas.",
              "No active matters where you can record a minute were found. Try a different search or review your matters.",
            )} <Link className="text-[var(--sea)] underline underline-offset-4" href="/mis-causas">{dict.nav.myMatters}</Link></p>
          )}
        </section>
      )}

      <section aria-labelledby="minutas-recientes">
        <div className="mb-3">
          <h2 id="minutas-recientes" className="text-lg font-semibold">{tr("Minutas recientes", "Recent minutes")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{tr("Abre una minuta para revisar lo registrado y sus acciones pendientes.", "Open a minute to review the record and its pending actions.")}</p>
        </div>
        {minutas.length === 0 ? (
          <EmptyState title={tr("Todavía no hay minutas", "No minutes yet")} description={tr(
            "Cuando registres una minuta, podrás volver a ella desde aquí.",
            "After you record a minute, you can return to it here.",
          )} />
        ) : (
          <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {minutas.map(minuta => (
              <li key={minuta.id}>
                <Link href={`/causas/${minuta.causaId}/minutas/${minuta.id}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-2 py-4 hover:bg-[var(--mist)] sm:px-3">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="text-xs font-medium text-[var(--sea)]">{labelTipoMinuta(minuta.tipo)}</p>
                    <p className="mt-0.5 break-words font-semibold">{minuta.titulo}</p>
                    <p className="mt-1 break-words text-sm text-[var(--muted)]">
                      {minuta.causa.rit || minuta.causa.titulo} · {minuta.autor?.name || tr("Sin autor", "No author")} · {formatDateTime(minuta.fecha)}
                    </p>
                  </div>
                  {minuta._count.acciones > 0 && (
                    <span className="text-xs text-[var(--muted)]">{tr(
                      minuta._count.acciones === 1 ? "1 acción pendiente" : `${minuta._count.acciones} acciones pendientes`,
                      minuta._count.acciones === 1 ? "1 pending action" : `${minuta._count.acciones} pending actions`,
                    )}</span>
                  )}
                  <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-[var(--sea)]" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManageTemplates && (
        <details className="border-t border-[var(--line)]">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-[var(--sea)]">
            {tr("Administrar plantillas", "Manage templates")}
          </summary>
          <MinutaPlantillasManager plantillas={plantillas} />
        </details>
      )}
    </div>
  );
}
