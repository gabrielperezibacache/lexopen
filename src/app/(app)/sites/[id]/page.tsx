import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  assertSitePageAccess,
  clientVisibleFileWhere,
  confidentialFileWhere,
} from "@/lib/auth/access";
import { isAdmin, isCliente } from "@/lib/auth/rbac";
import { SiteNav } from "@/components/sites/SiteNav";
import { SiteSettingsPanel } from "@/components/sites/SiteSettingsPanel";
import { NewISheetButton } from "@/components/sites/NewISheetButton";
import { StatusBadge, formatDate } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ welcome?: string }>;
};

export default async function SiteOverviewPage({ params, searchParams }: Params) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await assertSitePageAccess(id);
  const { t, dict } = await getI18n();
  if (isCliente(user.role)) {
    redirect(`/sites/${id}/archivos`);
  }
  const fileWhere = confidentialFileWhere(user.role);
  const [site, visibleFilesCount, documentoCount, clientes, causas] = await Promise.all([
    prisma.site.findUnique({
      where: { id },
      include: {
        cliente: true,
        causa: true,
        members: { include: { user: true } },
        tasks: { include: { assignee: true }, orderBy: { dueDate: "asc" }, take: 6 },
        files: { where: fileWhere, orderBy: { updatedAt: "desc" }, take: 6 },
        wikiPages: { take: 5, orderBy: { updatedAt: "desc" } },
        isheets: { include: { _count: { select: { rows: true } } } },
        qaThreads: { take: 4, orderBy: { updatedAt: "desc" } },
        activities: { include: { user: true }, orderBy: { createdAt: "desc" }, take: 10 },
        _count: { select: { tasks: true, members: true, wikiPages: true } },
      },
    }),
    prisma.siteFile.count({
      where: { siteId: id, ...clientVisibleFileWhere(user.role) },
    }),
    prisma.site
      .findUnique({ where: { id }, select: { causaId: true } })
      .then((s) =>
        s?.causaId
          ? prisma.documento.count({ where: { causaId: s.causaId } })
          : Promise.resolve(0)
      ),
    prisma.cliente.findMany({
      select: { id: true, razonSocial: true },
      orderBy: { razonSocial: "asc" },
      take: 200,
    }),
    prisma.causa.findMany({
      select: {
        id: true,
        titulo: true,
        rit: true,
        clienteId: true,
        site: { select: { id: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);
  if (!site) notFound();

  const causasForSettings = causas.map((c) => ({
    id: c.id,
    titulo: c.titulo,
    rit: c.rit,
    clienteId: c.clienteId,
    hasSite: Boolean(c.site && c.site.id !== id),
  }));

  const showWelcome = sp.welcome === "1";

  return (
    <div>
      <SiteNav
        siteId={site.id}
        siteName={site.name}
        tipo={site.tipo}
        color={site.color}
        active=""
        clienteName={site.cliente?.razonSocial}
        causaRit={site.causa?.rit || site.causa?.titulo}
        isClientVisible={site.isClientVisible}
        status={site.status}
      />

      {showWelcome && (
        <section className="panel mb-6 rounded-3xl border border-[var(--sea)]/20 p-5">
          <h2 className="text-lg font-semibold">{t("sites.overview.welcomeTitle")}</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--ink-soft)]/80">
            {dict.sites.overview.welcomeSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      <SiteSettingsPanel
        site={{
          id: site.id,
          name: site.name,
          description: site.description,
          tipo: site.tipo,
          status: site.status,
          color: site.color,
          isClientVisible: site.isClientVisible,
          clienteId: site.clienteId,
          causaId: site.causaId,
        }}
        clientes={clientes}
        causas={causasForSettings}
        isAdmin={isAdmin(user.role)}
        defaultOpen={!site.clienteId && !site.causaId}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t("sites.overview.stats.files"), value: visibleFilesCount },
          { label: t("sites.overview.stats.tasks"), value: site._count.tasks },
          { label: t("sites.overview.stats.wiki"), value: site._count.wikiPages },
          { label: t("sites.overview.stats.people"), value: site._count.members },
        ].map((s) => (
          <div key={s.label} className="panel rounded-3xl p-4">
            <div className="text-sm text-[var(--ink-soft)]/70">{s.label}</div>
            <div className="display mt-1 text-3xl">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="panel mb-6 rounded-3xl p-5">
        <h2 className="text-lg font-semibold">{t("sites.overview.linkedTitle")}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]/60">
              {t("sites.settings.client")}
            </p>
            {site.cliente ? (
              <Link href={`/clientes/${site.cliente.id}`} className="mt-1 inline-flex text-sm text-[var(--sea)]">
                {site.cliente.razonSocial} →
              </Link>
            ) : (
              <p className="mt-1 text-sm text-[var(--ink-soft)]/70">{t("sites.overview.noClient")}</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]/60">
              {t("sites.settings.case")}
            </p>
            {site.causa ? (
              <Link href={`/causas/${site.causa.id}`} className="mt-1 inline-flex text-sm text-[var(--sea)]">
                {site.causa.rit || site.causa.titulo} →
              </Link>
            ) : (
              <p className="mt-1 text-sm text-[var(--ink-soft)]/70">{t("sites.overview.noCase")}</p>
            )}
          </div>
        </div>
        {!site.cliente && !site.causa && (
          <p className="mt-4 text-sm text-[var(--ink-soft)]/75">{t("sites.overview.linkPrompt")}</p>
        )}
      </div>

      {site.causa && (
        <div className="panel mb-6 rounded-3xl p-5">
          <h2 className="text-lg font-semibold">{t("sites.overview.docsVsVdr")}</h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]/75">{t("sites.overview.docsVsVdrHint")}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <div>
              <p className="text-[var(--ink-soft)]/70">
                {t("sites.overview.documentCount").replace("{count}", String(documentoCount))}
              </p>
              <Link
                href={`/causas/${site.causa.id}`}
                className="mt-1 inline-flex text-[var(--sea)]"
              >
                {t("sites.overview.openDocuments")} →
              </Link>
            </div>
            <div>
              <p className="text-[var(--ink-soft)]/70">
                {t("sites.overview.vdrCount").replace("{count}", String(visibleFilesCount))}
              </p>
              <Link href={`/sites/${site.id}/archivos`} className="mt-1 inline-flex text-[var(--sea)]">
                {t("sites.overview.openVdr")} →
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-3xl p-5">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <h2 className="font-semibold">{t("sites.overview.recentTasks")}</h2>
            <Link href={`/sites/${site.id}/tareas`} className="text-sm text-[var(--sea)]">
              {t("sites.overview.viewAll")}
            </Link>
          </div>
          <div className="space-y-2">
            {site.tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{task.title}</div>
                  <div className="text-xs text-[var(--ink-soft)]/65">
                    {task.assignee?.name || "—"} · {formatDate(task.dueDate)}
                  </div>
                </div>
                <StatusBadge
                  estado={
                    task.status === "done" ? "cumplido" : task.status === "todo" ? "pendiente" : "activa"
                  }
                />
              </div>
            ))}
            {site.tasks.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                {t("sites.overview.noTasks")}{" "}
                <Link href={`/sites/${site.id}/tareas`} className="text-[var(--sea)]">
                  {t("sites.overview.createFirstTask")}
                </Link>
              </p>
            )}
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <h2 className="font-semibold">{t("sites.overview.recentFiles")}</h2>
            <Link href={`/sites/${site.id}/archivos`} className="text-sm text-[var(--sea)]">
              {t("sites.overview.dataRoom")}
            </Link>
          </div>
          <div className="space-y-2">
            {site.files.map((f) => (
              <div key={f.id} className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                <div className="font-medium">{f.name}</div>
                <div className="text-xs text-[var(--ink-soft)]/65">
                  v{f.version} · {formatDate(f.updatedAt)}
                </div>
              </div>
            ))}
            {site.files.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                {t("sites.overview.noFiles")}{" "}
                <Link href={`/sites/${site.id}/archivos`} className="text-[var(--sea)]">
                  {t("sites.overview.uploadVdr")}
                </Link>
              </p>
            )}
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <h2 className="font-semibold">{t("sites.overview.isheets")}</h2>
            <div className="flex gap-2">
              <NewISheetButton siteId={site.id} />
              <Link href={`/sites/${site.id}/isheets`} className="text-sm text-[var(--sea)]">
                {t("sites.overview.open")}
              </Link>
            </div>
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
              <p className="text-sm text-[var(--ink-soft)]/65">
                {t("sites.overview.noIsheets")}{" "}
                <Link href={`/sites/${site.id}/isheets`} className="text-[var(--sea)]">
                  {t("sites.overview.createIsheet")}
                </Link>
              </p>
            )}
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <h2 className="mb-3 font-semibold">{t("sites.overview.activity")}</h2>
          <div className="space-y-3">
            {site.activities.map((a) => (
              <div key={a.id} className="border-b border-[var(--line)] pb-2 text-sm last:border-0">
                <div>{a.mensaje}</div>
                <div className="text-xs text-[var(--ink-soft)]/60">
                  {a.user?.name || "Sistema"} · {formatDate(a.createdAt)}
                </div>
              </div>
            ))}
            {site.activities.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">{t("sites.overview.noActivity")}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
