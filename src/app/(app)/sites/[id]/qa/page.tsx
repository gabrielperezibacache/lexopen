import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteNav } from "@/components/sites/SiteNav";
import { StatusBadge, formatDateTime } from "@/components/ui";
import { QaActions } from "@/components/sites/QaActions";

type Params = { params: Promise<{ id: string }> };

export default async function SiteQaPage({ params }: Params) {
  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) notFound();
  const threads = await prisma.qaThread.findMany({
    where: { siteId: id },
    include: {
      posts: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <SiteNav siteId={site.id} siteName={site.name} tipo={site.tipo} color={site.color} active="/qa" />
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--ink-soft)]/75">
          Q&A del site — hilos con cliente y equipo, con respuestas marcadas.
        </p>
        <QaActions siteId={site.id} />
      </div>
      <div className="space-y-4">
        {threads.map((t) => (
          <article key={t.id} className="panel rounded-3xl p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{t.subject}</h2>
              <StatusBadge
                estado={t.status === "answered" ? "cumplido" : t.status === "open" ? "pendiente" : "activa"}
              />
              {t.category && <span className="badge badge-ink">{t.category}</span>}
            </div>
            <div className="mt-4 space-y-3">
              {t.posts.map((p) => (
                <div
                  key={p.id}
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    p.isAnswer
                      ? "border-[var(--ok)]/30 bg-[rgba(31,122,76,0.06)]"
                      : "border-[var(--line)] bg-white/70"
                  }`}
                >
                  <div className="text-xs text-[var(--ink-soft)]/60">
                    {p.author?.name || "Anónimo"} · {formatDateTime(p.createdAt)}
                    {p.isAnswer ? " · respuesta oficial" : ""}
                  </div>
                  <p className="mt-1">{p.body}</p>
                </div>
              ))}
            </div>
            <QaActions siteId={site.id} threadId={t.id} reply />
          </article>
        ))}
      </div>
    </div>
  );
}
