import { prisma } from "@/lib/db";
import { formatDate, StatusBadge } from "@/components/ui";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { isCliente, isStaff } from "@/lib/auth/rbac";

export default async function PortalPage() {
  const user = await requireUser();

  // Staff can preview; clients only see their memberships
  const sites = await prisma.site.findMany({
    where: {
      isClientVisible: true,
      ...(isCliente(user.role)
        ? { members: { some: { userId: user.id } } }
        : {}),
    },
    include: {
      cliente: true,
      causa: true,
      files: {
        where: {
          tags: { contains: "cliente" },
          confidencial: false,
        },
        take: 5,
        orderBy: { updatedAt: "desc" },
      },
      tasks: {
        where: { status: { not: "done" } },
        take: 3,
        orderBy: { dueDate: "asc" },
      },
      qaThreads: {
        where: { status: "open" },
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
        <h1 className="display mt-2 text-4xl">Portal del cliente</h1>
        <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
          Documentos compartidos, hitos y Q&A.{" "}
          {isCliente(user.role)
            ? "Solo ve sites donde es miembro."
            : "Vista previa staff (sites client-visible)."}
        </p>
      </div>

      {isCliente(user.role) && (
        <div className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm text-[var(--ink-soft)]/80">
          Acceso restringido: sin facturación interna, Hermes ni carpetas Drive del estudio.
        </div>
      )}

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
              <h3 className="text-sm font-semibold">Documentos compartidos</h3>
              <ul className="mt-2 space-y-1">
                {s.files.map((d) => (
                  <li key={d.id} className="text-sm text-[var(--ink-soft)]/80">
                    {d.name}
                  </li>
                ))}
                {s.files.length === 0 && (
                  <li className="text-sm text-[var(--ink-soft)]/60">
                    Sin archivos etiquetados cliente.
                  </li>
                )}
              </ul>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold">Q&A abiertas</h3>
              <ul className="mt-2 space-y-1">
                {s.qaThreads.map((q) => (
                  <li key={q.id} className="text-sm text-[var(--ink-soft)]/80">
                    {q.subject}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {isStaff(user.role) ? (
                <Link href={`/sites/${s.id}`} className="btn btn-secondary">
                  Abrir site (staff)
                </Link>
              ) : (
                <Link href={`/sites/${s.id}/qa`} className="btn btn-primary">
                  Ir a Q&A
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
        {sites.length === 0 && (
          <p className="text-sm text-[var(--ink-soft)]/65">
            No hay sites visibles para este usuario.
          </p>
        )}
      </div>
    </div>
  );
}
