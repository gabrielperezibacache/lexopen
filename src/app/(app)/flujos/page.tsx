import { WorkflowActions } from "@/components/sites/WorkflowActions";
import { StatusBadge, formatDate } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleHeader } from "@/components/ui/PageHeader";
import { siteRelatedWhere as scopedsiteRelatedWhere } from "@/lib/auth/causa-access";
import { publicUserSelect } from "@/lib/auth/public-user";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { safeJsonParse } from "@/lib/safe-json";
import Link from "next/link";

export default async function WorkflowsGlobalPage() {
  const user = await requireStaff();
  const { dict } = await getI18n();
  const h = dict.hubs.flujos;
  const workflows = await prisma.workflow.findMany({ where: scopedsiteRelatedWhere(user),
    include: {
      site: true,
      instances: {
        include: { actor: { select: publicUserSelect } },
        orderBy: { createdAt: "desc" },
        take: 6,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <ModuleHeader artwork="workflows" eyebrow={h.eyebrow} title={h.title} subtitle={h.subtitle} />
      {workflows.length === 0 ? (
        <EmptyState
          title={h.emptyTitle}
          description={h.emptyDescription}
          actionLabel={h.emptyAction}
          actionHref="/sites"
        />
      ) : null}
      <div className="space-y-4">
        {workflows.map((w) => {
          const steps = safeJsonParse<Array<{ name: string }>>(w.stepsJson, []);
          return (
            <section key={w.id} className="panel rounded-[var(--radius-xl)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{w.name}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">{w.description}</p>
                  <Link
                    href={`/sites/${w.siteId}/flujos`}
                    className="mt-2 inline-flex text-sm text-[var(--sea)]"
                  >
                    {w.site.name} →
                  </Link>
                  <div className="mt-2 text-xs text-[var(--muted)]">
                    {steps.map((s) => s.name).join(" → ")}
                  </div>
                </div>
                <WorkflowActions workflowId={w.id} active={w.active} />
              </div>
              <div className="mt-4 space-y-2">
                {w.instances.map((i) => (
                  <div
                    key={i.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                  >
                    <span>
                      {i.actor?.name || "—"} · {i.currentStep + 1} ·{" "}
                      {formatDate(i.createdAt)}
                    </span>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                        <WorkflowActions instanceId={i.id} currentStep={i.currentStep} advance />
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
