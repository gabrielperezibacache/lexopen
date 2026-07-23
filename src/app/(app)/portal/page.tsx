import { prisma } from "@/lib/db";
import { formatDate, StatusBadge } from "@/components/ui";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";

export default async function PortalPage() {
  const user = await getCurrentUser();
  const sites = await prisma.site.findMany({
    where: {
      isClientVisible: true,
      ...(user?.role === "cliente"
        ? { members: { some: { userId: user.id } } }
        : {}),
    },
    include: {
      cliente: true,
      causa: true,
      files: {
        where: { tags: { contains: "cliente" } },
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
          HighQ client experience
        </p>
        <h1 className="display mt-2 text-4xl">Portal del cliente</h1>
        <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
          Sites visibles al cliente: documentos compartidos, hitos y Q&A — con control de
          publicación vía workflows.
        </p>
      </div>

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
                  <li className="text-sm text-[var(--ink-soft)]/60">Sin archivos etiquetados cliente.</li>
                )}
              </ul>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold">Próximos hitos</h3>
              <ul className="mt-2 space-y-2">
                {s.tasks.map((p) => (
                  <li key={p.id} className="text-sm text-[var(--ink-soft)]/80">
                    {formatDate(p.dueDate)} — {p.title}
                  </li>
                ))}
              </ul>
            </div>

            {s.qaThreads.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold">Q&A abiertos</h3>
                <ul className="mt-2 space-y-1">
                  {s.qaThreads.map((q) => (
                    <li key={q.id} className="text-sm text-[var(--ink-soft)]/80">
                      {q.subject}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Link href={`/sites/${s.id}`} className="mt-5 inline-flex text-sm text-[var(--sea)]">
              Abrir site →
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
