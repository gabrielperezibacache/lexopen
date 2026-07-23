import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteNav } from "@/components/sites/SiteNav";
import { StatusBadge, formatDate } from "@/components/ui";
import { WorkflowActions } from "@/components/sites/WorkflowActions";

type Params = { params: Promise<{ id: string }> };

export default async function SiteWorkflowsPage({ params }: Params) {
  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) notFound();
  const workflows = await prisma.workflow.findMany({
    where: { siteId: id },
    include: {
      instances: {
        include: { actor: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
  });

  return (
    <div>
      <SiteNav siteId={site.id} siteName={site.name} tipo={site.tipo} color={site.color} active="/flujos" />
      <p className="mb-4 text-sm text-[var(--ink-soft)]/75">
        Workflows de aprobación — escritos, publicación a portal y triggers.
      </p>
      <div className="space-y-4">
        {workflows.map((w) => {
          const steps = JSON.parse(w.stepsJson) as Array<{ name: string; role: string }>;
          return (
            <section key={w.id} className="panel rounded-3xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{w.name}</h2>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]/75">{w.description}</p>
                  <div className="mt-2 text-xs text-[var(--ink-soft)]/60">
                    trigger: {w.triggerType} · {steps.map((s) => s.name).join(" → ")}
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
                    <div>
                      Instancia · paso {i.currentStep + 1}/{steps.length} ·{" "}
                      {i.actor?.name || "—"} · {formatDate(i.createdAt)}
                    </div>
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
