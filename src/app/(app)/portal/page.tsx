import { prisma } from "@/lib/db";
import { formatDate, StatusBadge } from "@/components/ui";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { isCliente, isStaff } from "@/lib/auth/rbac";
import { clientSharedTagPrismaWhere } from "@/lib/auth/client-tags";
import { EmptyState } from "@/components/EmptyState";
import { labelTramiteEstado } from "@/lib/tramites";

export default async function PortalPage() {
  const user = await requireUser();

  const sites = await prisma.site.findMany({
    where: {
      isClientVisible: true,
      ...(isCliente(user.role)
        ? { members: { some: { userId: user.id } } }
        : {}),
    },
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
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          Experiencia cliente
        </p>
        <h1 className="display mt-2 break-words text-2xl sm:text-3xl md:text-4xl">Portal del cliente</h1>
        <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
          Documentos compartidos, hitos y Q&A.{" "}
          {isCliente(user.role)
            ? "Solo ve espacios donde es miembro."
            : "Vista previa staff (espacios visibles al cliente)."}
        </p>
      </div>

      {isCliente(user.role) && (
        <div className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm text-[var(--ink-soft)]/80">
          Acceso restringido: sin facturación interna, Hermes ni carpetas Drive del estudio.
        </div>
      )}

      {sites.length === 0 ? (
        <EmptyState
          title="Sin espacios en el portal"
          description={
            isCliente(user.role)
              ? "Cuando el estudio comparta un matter o carpeta, aparecerá aquí con documentos y Q&A."
              : "Marque un espacio como visible al cliente y asigne miembros para activar el portal."
          }
          actionLabel={isStaff(user.role) ? "Ir a espacios" : undefined}
          actionHref={isStaff(user.role) ? "/sites" : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sites.map((s) => (
            <article key={s.id} className="panel rounded-3xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-[var(--ink-soft)]/55">
                    {s.cliente?.razonSocial || "Cliente"}
                  </div>
                  <h2 className="mt-1 text-xl font-semibold">{s.name}</h2>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
                    {s.causa?.rit || s.tipo} · {s.causa?.tribunal || "Portal"}
                  </p>
                </div>
                <StatusBadge estado="activa" />
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Documentos compartidos</h3>
                  <Link href={`/sites/${s.id}/archivos`} className="text-xs text-[var(--sea)]">
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
                    <li className="text-sm text-[var(--ink-soft)]/60">
                      Sin archivos etiquetados cliente.
                    </li>
                  )}
                </ul>
              </div>

              {s.causa && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">Trámites de la causa</h3>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]/55">
                    Vista informativa (solo lectura).
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {s.causa.tramites.map((t) => (
                      <li
                        key={t.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-[var(--ink-soft)]/85"
                      >
                        <span>{t.titulo}</span>
                        <span className="text-xs text-[var(--ink-soft)]/55">
                          {labelTramiteEstado(t.estado)}
                          {t.fechaLimite
                            ? ` · ${formatDate(t.fechaLimite)}`
                            : ""}
                        </span>
                      </li>
                    ))}
                    {s.causa.tramites.length === 0 && (
                      <li className="text-sm text-[var(--ink-soft)]/60">
                        Sin trámites publicados aún.
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div className="mt-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Q&A abiertas</h3>
                  <Link href={`/sites/${s.id}/qa`} className="text-xs text-[var(--sea)]">
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
                    <li className="text-sm text-[var(--ink-soft)]/60">Sin hilos abiertos.</li>
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
