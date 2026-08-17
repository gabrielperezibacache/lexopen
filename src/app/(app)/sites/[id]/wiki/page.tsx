import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertSitePageAccess } from "@/lib/auth/access";
import { SiteNav } from "@/components/sites/SiteNav";
import { NewWikiButton } from "@/components/sites/NewWikiButton";
import { EditWikiButton } from "@/components/sites/EditWikiButton";
import { WikiHistoryPanel } from "@/components/sites/WikiHistoryPanel";
import { MarkdownView } from "@/lib/markdown";
import { EmptyState } from "@/components/EmptyState";
import { isCliente } from "@/lib/auth/rbac";
import { getI18n } from "@/lib/i18n/server";

type Params = { params: Promise<{ id: string }> };

export default async function SiteWikiPage({ params }: Params) {
  const { id } = await params;
  const user = await assertSitePageAccess(id);
  const { t } = await getI18n();
  const site = await prisma.site.findUnique({
    where: { id },
    include: { cliente: true, causa: true },
  });
  if (!site) notFound();
  const pages = await prisma.wikiPage.findMany({
    where: { siteId: id },
    include: { author: true },
    orderBy: { title: "asc" },
  });
  const canEdit = !isCliente(user.role);

  return (
    <div>
      <SiteNav
        siteId={site.id}
        siteName={site.name}
        tipo={site.tipo}
        color={site.color}
        active="/wiki"
        clienteName={site.cliente?.razonSocial}
        causaRit={site.causa?.rit || site.causa?.titulo}
        isClientVisible={site.isClientVisible}
        status={site.status}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <p className="text-sm text-[var(--ink-soft)]/75">{t("sites.wikiHint")}</p>
        {canEdit && <NewWikiButton siteId={site.id} />}
      </div>
      {pages.length === 0 ? (
        <EmptyState
          title="Wiki vacía"
          description="Documente playbooks, checklists o el home del matter en Markdown."
          action={canEdit ? <NewWikiButton siteId={site.id} /> : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pages.map((p) => (
            <article
              key={p.id}
              id={p.slug}
              className="panel scroll-mt-24 rounded-3xl p-5"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-xl font-semibold">{p.title}</h2>
                  <p className="mt-1 break-words text-xs text-[var(--ink-soft)]/60">
                    /{p.slug} · {p.author?.name || "—"}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <EditWikiButton
                      siteId={site.id}
                      page={{ id: p.id, title: p.title, content: p.content }}
                    />
                    <WikiHistoryPanel siteId={site.id} pageId={p.id} />
                  </div>
                )}
              </div>
              <div className="mt-4 max-h-72 overflow-auto border-t border-[var(--line)] pt-3">
                <MarkdownView content={p.content} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
