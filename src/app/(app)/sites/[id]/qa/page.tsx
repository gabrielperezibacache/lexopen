import { EmptyState } from "@/components/EmptyState";
import { QaActions } from "@/components/sites/QaActions";
import { SiteNav } from "@/components/sites/SiteNav";
import { StatusBadge, formatDateTime } from "@/components/ui";
import { assertSitePageAccess } from "@/lib/auth/access";
import { siteAccessWhere as scopedsiteAccessWhere, siteRelatedWhere as scopedsiteRelatedWhere } from "@/lib/auth/causa-access";
import { publicUserSelect } from "@/lib/auth/public-user";
import { isCliente } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ListPagination } from "@/components/ui/ListPagination";
import { listCursorWhere, listPageHref, listWindow } from "@/lib/api/list-window";
import { getLocale } from "@/lib/i18n/server";
import { notFound } from "next/navigation";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ pregunta?: string; after?: string }> };

export default async function SiteQaPage({ params, searchParams }: Params) {
  const { id } = await params;
  const user = await assertSitePageAccess(id);
  const clientView = isCliente(user.role);
  const { pregunta, after: rawAfter } = await searchParams;
  const after = typeof rawAfter === "string" ? rawAfter : undefined;
  if (pregunta !== undefined && (typeof pregunta !== "string" || !/^[\w-]{1,128}$/.test(pregunta))) notFound();
  const english = (await getLocale()) === "en";
  const path = `/sites/${id}/qa`;
  const [site, rows] = await Promise.all([
    prisma.site.findFirst({
      where: { AND: [scopedsiteAccessWhere(user), { id }] },
      select: { id: true, name: true, tipo: true, color: true },
    }),
    prisma.qaThread.findMany({
      where: { AND: [scopedsiteRelatedWhere(user), {
        siteId: id,
        ...(pregunta ? { id: pregunta } : listCursorWhere(after, "updatedAt")),
        ...(clientView ? { status: "open" } : {}),
      }] },
      include: {
        _count: { select: { posts: true } },
        posts: {
          take: pregunta ? undefined : 0,
          include: { author: { select: publicUserSelect } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: pregunta ? 1 : 26,
    }),
  ]);
  if (!site || (pregunta && !rows.length)) notFound();
  const { items: threads, next } = listWindow(rows, 25, "updatedAt");

  return (
    <div>
      <SiteNav
        siteId={site.id}
        siteName={site.name}
        tipo={site.tipo}
        color={site.color}
        active="/qa"
        clientView={clientView}
      />
      {pregunta && <Link className="btn btn-ghost mb-3" href={listPageHref(path, {}, after)}>{english ? "All questions" : "Todas las preguntas"}</Link>}
      {!pregunta && <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <p className="text-sm text-[var(--ink-soft)]/75">
          {clientView
            ? "Preguntas abiertas del espacio — puede abrir hilos y responder mientras estén abiertos."
            : "Preguntas del cliente y del equipo, con respuestas que el estudio marca como oficiales."}
        </p>
        {threads.length > 0 && <QaActions siteId={site.id} canMarkAnswer={!clientView} />}
      </div>}
      {threads.length === 0 && !after && (
        <EmptyState
          title="Todavía no hay preguntas"
          description={
            clientView
              ? "Abra una pregunta para el estudio. Solo verá hilos abiertos."
              : "Abra una pregunta para el cliente o el equipo. Las respuestas oficiales quedan marcadas."
          }
          action={<QaActions siteId={site.id} canMarkAnswer={!clientView} />}
        />
      )}
      <div className="space-y-4">
        {threads.map((t) => (
          <article key={t.id} className="panel rounded-3xl p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{pregunta ? t.subject : <Link className="text-[var(--sea)] hover:underline" href={listPageHref(path, { pregunta: t.id }, after)}>{t.subject}</Link>}</h2>
              <StatusBadge
                estado={
                  t.status === "answered"
                    ? "cumplido"
                    : t.status === "open"
                      ? "pendiente"
                      : "activa"
                }
              />
              {t.category && <span className="badge badge-ink">{t.category}</span>}
            </div>
            {!pregunta && <p className="mt-2 text-sm text-[var(--muted)]">
              {t._count.posts} {english ? (t._count.posts === 1 ? "message" : "messages") : (t._count.posts === 1 ? "mensaje" : "mensajes")} · {formatDateTime(t.updatedAt)}
            </p>}
            {pregunta && <div className="mt-4 space-y-3">
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
            </div>}
            {pregunta && (!clientView || t.status === "open") && (
              <QaActions
                siteId={site.id}
                threadId={t.id}
                reply
                canMarkAnswer={!clientView}
              />
            )}
          </article>
        ))}
      </div>
      {!pregunta && (after || next) && <ListPagination path={path} after={after} next={next} count={threads.length} />}
    </div>
  );
}
