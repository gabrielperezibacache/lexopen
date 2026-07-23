import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteNav } from "@/components/sites/SiteNav";
import { StatusBadge, formatDate } from "@/components/ui";

type Params = { params: Promise<{ id: string }> };

export default async function SiteOverviewPage({ params }: Params) {
  const { id } = await params;
  const site = await prisma.site.findUnique({
    where: { id },
    include: {
      cliente: true,
      causa: true,
      members: { include: { user: true } },
      tasks: { include: { assignee: true }, orderBy: { dueDate: "asc" }, take: 6 },
      files: { orderBy: { updatedAt: "desc" }, take: 6 },
      wikiPages: { take: 5, orderBy: { updatedAt: "desc" } },
      isheets: { include: { _count: { select: { rows: true } } } },
      qaThreads: { take: 4, orderBy: { updatedAt: "desc" } },
      activities: { include: { user: true }, orderBy: { createdAt: "desc" }, take: 10 },
      _count: { select: { files: true, tasks: true, members: true, wikiPages: true } },
    },
  });
  if (!site) notFound();

  return (
    <div>
      <SiteNav
        siteId={site.id}
        siteName={site.name}
        tipo={site.tipo}
        color={site.color}
        active=""
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Files", value: site._count.files },
          { label: "Tasks", value: site._count.tasks },
          { label: "Wiki pages", value: site._count.wikiPages },
          { label: "People", value: site._count.members },
        ].map((s) => (
          <div key={s.label} className="panel rounded-3xl p-4">
            <div className="text-sm text-[var(--ink-soft)]/70">{s.label}</div>
            <div className="display mt-1 text-3xl">{s.value}</div>
          </div>
        ))}
      </div>

      {(site.causa || site.cliente) && (
        <div className="panel mb-6 rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Contexto Chile</h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]/80">
            {site.cliente?.razonSocial || "Sin cliente"}
            {site.causa
              ? ` · ${site.causa.rit || site.causa.titulo} · ${site.causa.tribunal}`
              : ""}
          </p>
          {site.causa && (
            <Link href={`/causas/${site.causa.id}`} className="mt-3 inline-flex text-sm text-[var(--sea)]">
              Abrir ficha de causa →
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Tasks</h2>
            <Link href={`/sites/${site.id}/tareas`} className="text-sm text-[var(--sea)]">
              Ver
            </Link>
          </div>
          <div className="space-y-2">
            {site.tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-[var(--ink-soft)]/65">
                    {t.assignee?.name || "Sin asignar"} · {formatDate(t.dueDate)}
                  </div>
                </div>
                <StatusBadge estado={t.status === "done" ? "cumplido" : t.status === "todo" ? "pendiente" : "activa"} />
              </div>
            ))}
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Files recientes</h2>
            <Link href={`/sites/${site.id}/archivos`} className="text-sm text-[var(--sea)]">
              Data room
            </Link>
          </div>
          <div className="space-y-2">
            {site.files.map((f) => (
              <div key={f.id} className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                <div className="font-medium">{f.name}</div>
                <div className="text-xs text-[var(--ink-soft)]/65">v{f.version} · {formatDate(f.updatedAt)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">iSheets</h2>
            <Link href={`/sites/${site.id}/isheets`} className="text-sm text-[var(--sea)]">
              Abrir
            </Link>
          </div>
          <div className="space-y-2">
            {site.isheets.map((s) => (
              <Link
                key={s.id}
                href={`/sites/${site.id}/isheets/${s.id}`}
                className="block rounded-xl border border-[var(--line)] px-3 py-2 text-sm hover:border-[var(--sea)]/40"
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-[var(--ink-soft)]/65">{s._count.rows} filas</div>
              </Link>
            ))}
            {site.isheets.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">Sin iSheets aún.</p>
            )}
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <h2 className="mb-3 font-semibold">Activity stream</h2>
          <div className="space-y-3">
            {site.activities.map((a) => (
              <div key={a.id} className="border-b border-[var(--line)] pb-2 text-sm last:border-0">
                <div>{a.mensaje}</div>
                <div className="text-xs text-[var(--ink-soft)]/60">
                  {a.user?.name || "Sistema"} · {formatDate(a.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
