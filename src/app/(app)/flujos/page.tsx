import Link from "next/link";
import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { StatusBadge, formatDate } from "@/components/ui";
import { WorkflowActions } from "@/components/sites/WorkflowActions";

export default async function WorkflowsGlobalPage() {
  const workflows = await prisma.workflow.findMany({
    include: {
      site: true,
      instances: {
        include: { actor: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <ModuleHeader
        eyebrow="Automation"
        title="Workflows"
        subtitle="Aprobaciones multi-paso para escritos, publicación a portal y triggers de site."
      />
      <div className="space-y-4">
        {workflows.map((w) => {
          const steps = JSON.parse(w.stepsJson) as Array<{ name: string }>;
          return (
            <section key={w.id} className="panel rounded-3xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{w.name}</h2>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]/75">{w.description}</p>
                  <Link href={`/sites/${w.siteId}/flujos`} className="mt-2 inline-flex text-sm text-[var(--sea)]">
                    {w.site.name} →
                  </Link>
                  <div className="mt-2 text-xs text-[var(--ink-soft)]/60">
                    {steps.map((s) => s.name).join(" → ")}
                  </div>
                </div>
                <WorkflowActions workflowId={w.id} />
              </div>
              <div className="mt-4 space-y-2">
                {w.instances.map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
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
