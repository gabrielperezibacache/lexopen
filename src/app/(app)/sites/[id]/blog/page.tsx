import { EmptyState } from "@/components/EmptyState";
import { EditBlogPostButton } from "@/components/sites/EditBlogPostButton";
import { NewBlogPostButton } from "@/components/sites/NewBlogPostButton";
import { SiteNav } from "@/components/sites/SiteNav";
import { formatDate } from "@/components/ui";
import { assertSitePageAccess } from "@/lib/auth/access";
import { siteAccessWhere as scopedsiteAccessWhere, siteRelatedWhere as scopedsiteRelatedWhere } from "@/lib/auth/causa-access";
import { isCliente } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { MarkdownView } from "@/lib/markdown";
import { notFound } from "next/navigation";

type Params = { params: Promise<{ id: string }> };

export default async function SiteBlogPage({ params }: Params) {
  const { id } = await params;
  const user = await assertSitePageAccess(id);
  const { t } = await getI18n();
  const clientView = isCliente(user.role);
  const [site, posts] = await Promise.all([
    prisma.site.findFirst({
      where: { AND: [scopedsiteAccessWhere(user), { id }] },
      select: {
        id: true,
        name: true,
        tipo: true,
        color: true,
        status: true,
        isClientVisible: true,
        cliente: { select: { razonSocial: true } },
        causa: { select: { rit: true, titulo: true } },
      },
    }),
    prisma.blogPost.findMany({
      where: { AND: [scopedsiteRelatedWhere(user), {
        siteId: id,
        ...(clientView ? { published: true } : {}),
      }] },
      include: { author: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!site) notFound();

  return (
    <div>
      <SiteNav
        siteId={site.id}
        siteName={site.name}
        tipo={site.tipo}
        color={site.color}
        active="/blog"
        clientView={clientView}
        clienteName={site.cliente?.razonSocial}
        causaRit={site.causa?.rit || site.causa?.titulo}
        isClientVisible={site.isClientVisible}
        status={site.status}
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-[var(--ink-soft)]/75">{t("sites.blogHint")}</p>
        {!clientView && <NewBlogPostButton siteId={site.id} />}
      </div>
      {posts.length === 0 ? (
        <EmptyState
          title="Sin publicaciones"
          description="Comparte anuncios y novedades de este espacio."
          action={!clientView ? <NewBlogPostButton siteId={site.id} /> : undefined}
        />
      ) : (
        <div className="space-y-4">
          {posts.map((p) => (
            <article key={p.id} className="panel rounded-3xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl font-semibold">{p.title}</h2>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]/60">
                    {p.author?.name || "—"} · {formatDate(p.createdAt)}
                    {!p.published ? " · borrador" : ""}
                  </p>
                </div>
                {!clientView && (
                  <EditBlogPostButton
                    siteId={site.id}
                    post={{
                      id: p.id,
                      title: p.title,
                      body: p.body,
                      published: p.published,
                    }}
                  />
                )}
              </div>
              <div className="mt-4 border-t border-[var(--line)] pt-3">
                <MarkdownView content={p.body} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
