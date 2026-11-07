import styles from "@/components/config/WorkspaceArea.module.css";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/sites/SiteNav";
import { formatDate, StatusBadge } from "@/components/ui";
import { siteAccessWhere as scopedsiteAccessWhere } from "@/lib/auth/causa-access";
import { clientSharedTagPrismaWhere } from "@/lib/auth/client-tags";
import { isCliente, isStaff } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { labelTramiteEstado } from "@/lib/tramites";
import Link from "next/link";

export default async function PortalPage() {
  const user = await requireUser();
  const { t } = await getI18n();

  const sites = await prisma.site.findMany({
    where: { AND: [scopedsiteAccessWhere(user), {
      isClientVisible: true,
      ...(isCliente(user.role)
        ? { members: { some: { userId: user.id } } }
        : {}),
    }] },
    select: {
      id: true,
      name: true,
      tipo: true,
      cliente: { select: { razonSocial: true } },
      causa: {
        select: {
          id: true,
          rit: true,
          tribunal: true,
          etapa: true,
          estado: true,
          updatedAt: true,
          tramites: {
            where: { estado: { in: ["pendiente", "en_curso", "hecho"] } },
            orderBy: [{ orden: "asc" }, { fechaLimite: "asc" }],
            take: 8,
            select: {
              id: true,
              titulo: true,
              estado: true,
              fechaLimite: true,
            },
          },
          plazos: {
            where: { estado: { in: ["pendiente", "vencido"] }, minutaAcciones: { none: { minuta: { confidencial: true } } } },
            orderBy: { fechaLimite: "asc" },
            take: 5,
            select: {
              id: true,
              titulo: true,
              fechaLimite: true,
              esFatal: true,
            },
          },
          movimientos: {
            orderBy: { fecha: "desc" },
            take: 5,
            select: {
              id: true,
              titulo: true,
              fecha: true,
              tipo: true,
            },
          },
        },
      },
      files: {
        where: {
          AND: [
            { confidencial: false, privilegio: false },
            clientSharedTagPrismaWhere(),
          ],
        },
        select: { id: true, name: true },
        take: 5,
        orderBy: { updatedAt: "desc" },
      },
      qaThreads: {
        where: { status: "open" },
        select: { id: true, subject: true },
        take: 3,
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className={`${styles.area} space-y-6`}>
      <PageHeader artwork="people"
        eyebrow={t("portal.eyebrow")}
        title={t("portal.title")}
        subtitle={
          isCliente(user.role) ? t("portal.subtitleClient") : t("portal.subtitleStaff")
        }
      />

      {isCliente(user.role) && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink-soft)]/80">
          {t("portal.notice")}
        </div>
      )}

      {sites.length === 0 ? (
        <EmptyState
          title="Sin espacios en el portal"
          description={
            isCliente(user.role)
              ? "Cuando el estudio comparta un espacio o una carpeta, aquí encontrarás sus documentos y consultas."
              : "Marque un espacio como visible al cliente y asigne miembros para activar el portal."
          }
          actionLabel={isStaff(user.role) ? "Ir a espacios" : undefined}
          actionHref={isStaff(user.role) ? "/sites" : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sites.map((s) => (
            <article key={s.id} className="panel rounded-3xl p-5">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--ink-soft)]">
                    {s.cliente?.razonSocial || "Cliente"}
                  </div>
                  <h2 className="mt-1 break-words text-xl font-semibold">{s.name}</h2>
                  <p className="mt-1 break-words text-sm text-[var(--ink-soft)]/70">
                    {s.causa?.rit || s.tipo} · {s.causa?.tribunal || "Portal"}
                    {s.causa?.etapa ? ` · etapa ${s.causa.etapa}` : ""}
                  </p>
                </div>
                <StatusBadge estado={s.causa?.estado === "terminada" ? "cumplido" : "activa"} />
              </div>

              {s.causa && (s.causa.movimientos.length > 0 || s.causa.plazos.length > 0) && (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold">Últimos movimientos</h3>
                    <ul className="mt-2 space-y-1.5">
                      {s.causa.movimientos.map((m) => (
                        <li key={m.id} className="text-sm text-[var(--ink-soft)]/85">
                          {m.titulo}
                          <span className="block text-sm text-[var(--ink-soft)]">
                            {formatDate(m.fecha)} · {m.tipo}
                          </span>
                        </li>
                      ))}
                      {s.causa.movimientos.length === 0 && (
                        <li className="text-sm text-[var(--ink-soft)]">Sin movimientos.</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Plazos publicados</h3>
                    <ul className="mt-2 space-y-1.5">
                      {s.causa.plazos.map((p) => (
                        <li key={p.id} className="text-sm text-[var(--ink-soft)]/85">
                          {p.esFatal ? "Fatal · " : ""}
                          {p.titulo}
                          <span className="block text-sm text-[var(--ink-soft)]">
                            {formatDate(p.fechaLimite)}
                          </span>
                        </li>
                      ))}
                      {s.causa.plazos.length === 0 && (
                        <li className="text-sm text-[var(--ink-soft)]">Sin plazos listados.</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              <div className="mt-5">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Documentos compartidos</h3>
                  <Link href={`/sites/${s.id}/archivos`} className="inline-flex min-h-11 items-center text-sm text-[var(--sea)] hover:underline">
                    Ver archivos
                  </Link>
                </div>
                <ul className="mt-2 space-y-1">
                  {s.files.map((d) => (
                    <li key={d.id} className="text-sm text-[var(--ink-soft)]/80">
                      <a
                        href={`/api/sites/${s.id}/files/${d.id}/content`}
                        className="text-[var(--sea)]"
                      >
                        {d.name}
                      </a>
                    </li>
                  ))}
                  {s.files.length === 0 && (
                    <li className="text-sm text-[var(--ink-soft)]">
                      Sin archivos etiquetados cliente.
                    </li>
                  )}
                </ul>
              </div>

              {s.causa && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">Trámites de la causa</h3>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    Vista informativa (solo lectura).
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {s.causa.tramites.map((t) => (
                      <li
                        key={t.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-[var(--ink-soft)]/85"
                      >
                        <span>{t.titulo}</span>
                        <span className="text-sm text-[var(--ink-soft)]">
                          {labelTramiteEstado(t.estado)}
                          {t.fechaLimite
                            ? ` · ${formatDate(t.fechaLimite)}`
                            : ""}
                        </span>
                      </li>
                    ))}
                    {s.causa.tramites.length === 0 && (
                      <li className="text-sm text-[var(--ink-soft)]">
                        Sin trámites publicados aún.
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div className="mt-5">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Q&A abiertas</h3>
                  <Link href={`/sites/${s.id}/qa`} className="inline-flex min-h-11 items-center text-sm text-[var(--sea)] hover:underline">
                    Ir a Q&A
                  </Link>
                </div>
                <ul className="mt-2 space-y-1">
                  {s.qaThreads.map((q) => (
                    <li key={q.id} className="text-sm">
                      <Link
                        href={`/sites/${s.id}/qa`}
                        className="text-[var(--sea)] hover:underline"
                      >
                        {q.subject}
                      </Link>
                    </li>
                  ))}
                  {s.qaThreads.length === 0 && (
                    <li className="text-sm text-[var(--ink-soft)]">Sin hilos abiertos.</li>
                  )}
                </ul>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={`/sites/${s.id}/qa`} className="btn btn-primary">
                  Abrir Q&A
                </Link>
                <Link href={`/sites/${s.id}/archivos`} className="btn btn-secondary">
                  Documentos
                </Link>
                <Link href={`/sites/${s.id}/blog`} className="btn btn-ghost">
                  Blog
                </Link>
                <Link href="/mensajes" className="btn btn-ghost">
                  Mensajes
                </Link>
                {isStaff(user.role) && (
                  <Link href={`/sites/${s.id}`} className="btn btn-ghost">
                    Resumen del espacio
                  </Link>
                )}
                {s.causa && isStaff(user.role) && (
                  <Link href={`/causas/${s.causa.id}`} className="btn btn-ghost">
                    Causa {formatDate(s.causa.updatedAt)}
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
