import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertSitePageAccess } from "@/lib/auth/access";
import { SiteNav } from "@/components/sites/SiteNav";
import { StatusBadge, formatDate } from "@/components/ui";
import { WorkflowActions } from "@/components/sites/WorkflowActions";
import { EmptyState } from "@/components/EmptyState";
import { publicUserSelect } from "@/lib/auth/public-user";
import { getI18n } from "@/lib/i18n/server";

type Params = { params: Promise<{ id: string }> };

export default async function SiteWorkflowsPage({ params }: Params) {
  const { id } = await params;
  await assertSitePageAccess(id);
  const { t } = await getI18n();
  const site = await prisma.site.findUnique({
    where: { id },
    include: { cliente: true, causa: true },
  });
  if (!site) notFound();
  const workflows = await prisma.workflow.findMany({
    where: { siteId: id },
    include: {
      instances: {
        include: { actor: { select: publicUserSelect } },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
  });

  return (
    <div>
      <SiteNav
        siteId={site.id}
        siteName={site.name}
        tipo={site.tipo}
        color={site.color}
        active="/flujos"
        clienteName={site.cliente?.razonSocial}
        causaRit={site.causa?.rit || site.causa?.titulo}
        isClientVisible={site.isClientVisible}
        status={site.status}
      />
      <p className="mb-4 text-sm text-[var(--ink-soft)]/75">
        Flujos de aprobación — escritos, publicación a portal y disparadores.
      </p>
      {workflows.length === 0 ? (
        <EmptyState
          title={t("sites.flowsEmpty")}
          description=""
          actionLabel={t("sites.flowsGlobal")}
          actionHref="/flujos"
        />
      ) : null}
      <div className="space-y-4">
        {workflows.map((w) => {
          const steps = (() => {
            try {
              const parsed = JSON.parse(w.stepsJson) as Array<{
                name: string;
                role: string;
              }>;
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [] as Array<{ name: string; role: string }>;
            }
          })();
          return (
            <section key={w.id} className="panel rounded-3xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{w.name}</h2>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]/75">{w.description}</p>
                  <div className="mt-2 text-xs text-[var(--ink-soft)]/60">
                    {steps.map((s) => s.name).join(" → ")}
                  </div>
                </div>
                <WorkflowActions workflowId={w.id} />
              </div>
              <div className="mt-4 space-y-2">
                {w.instances.map((i) => (
                  <div
                    key={i.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                  >
                    <span>
                      {i.actor?.name || "—"} · paso {i.currentStep + 1} · {formatDate(i.createdAt)}
                    </span>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        estado={
                          i.status === "approved"
                            ? "cumplido"
                            : i.status === "rejected"
                              ? "vencido"
                              : "pendiente"
                        }
                      />
                      {(i.status === "pending" || i.status === "running") && (
                        <WorkflowActions instanceId={i.id} advance />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
