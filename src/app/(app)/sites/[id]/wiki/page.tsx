import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteNav } from "@/components/sites/SiteNav";
import { NewWikiButton } from "@/components/sites/NewWikiButton";

type Params = { params: Promise<{ id: string }> };

export default async function SiteWikiPage({ params }: Params) {
  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) notFound();
  const pages = await prisma.wikiPage.findMany({
    where: { siteId: id },
    include: { author: true },
    orderBy: { title: "asc" },
  });

  return (
    <div>
      <SiteNav siteId={site.id} siteName={site.name} tipo={site.tipo} color={site.color} active="/wiki" />
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--ink-soft)]/75">
          Wiki colaborativa del site — playbooks, checklists y home del matter.
        </p>
        <NewWikiButton siteId={site.id} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {pages.map((p) => (
          <article key={p.id} className="panel rounded-3xl p-5">
            <h2 className="text-xl font-semibold">{p.title}</h2>
            <p className="mt-1 text-xs text-[var(--ink-soft)]/60">
              /{p.slug} · {p.author?.name || "—"}
            </p>
            <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--ink-soft)]/85">
              {p.content}
            </pre>
          </article>
        ))}
      </div>
    </div>
  );
}
