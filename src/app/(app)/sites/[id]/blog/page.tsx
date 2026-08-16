import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertSitePageAccess } from "@/lib/auth/access";
import { isCliente } from "@/lib/auth/rbac";
import { SiteNav } from "@/components/sites/SiteNav";
import { MarkdownView } from "@/lib/markdown";
import { formatDate } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { NewBlogPostButton } from "@/components/sites/NewBlogPostButton";

type Params = { params: Promise<{ id: string }> };

export default async function SiteBlogPage({ params }: Params) {
  const { id } = await params;
  const user = await assertSitePageAccess(id);
  const clientView = isCliente(user.role);
  const site = await prisma.site.findUnique({
    where: { id },
    select: { id: true, name: true, tipo: true, color: true },
  });
  if (!site) notFound();

  const posts = await prisma.blogPost.findMany({
    where: {
      siteId: id,
      ...(clientView ? { published: true } : {}),
    },
    include: { author: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <SiteNav
        siteId={site.id}
        siteName={site.name}
        tipo={site.tipo}
        color={site.color}
        active="/blog"
        clientView={clientView}
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-[var(--ink-soft)]/75">
          Publicaciones del espacio (Markdown).
        </p>
        {!clientView && <NewBlogPostButton siteId={site.id} />}
      </div>
      {posts.length === 0 ? (
        <EmptyState
          title="Sin publicaciones"
          description="Publique anuncios o actualizaciones del matter."
          action={!clientView ? <NewBlogPostButton siteId={site.id} /> : undefined}
        />
      ) : (
        <div className="space-y-4">
          {posts.map((p) => (
            <article key={p.id} className="panel rounded-3xl p-5">
              <h2 className="text-xl font-semibold">{p.title}</h2>
              <p className="mt-1 text-xs text-[var(--ink-soft)]/60">
                {p.author?.name || "—"} · {formatDate(p.createdAt)}
                {!p.published ? " · borrador" : ""}
              </p>
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
