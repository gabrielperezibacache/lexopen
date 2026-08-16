import { prisma } from "@/lib/db";

/** Start pending workflow instances for active workflows with a given trigger. */
export async function triggerSiteWorkflows(opts: {
  siteId: string;
  triggerType: "file_upload" | "task_done" | "isheet_row";
  actorId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const workflows = await prisma.workflow.findMany({
    where: {
      siteId: opts.siteId,
      active: true,
      triggerType: opts.triggerType,
    },
    select: { id: true },
  });
  if (!workflows.length) return { started: 0 };
  await prisma.workflowInstance.createMany({
    data: workflows.map((w) => ({
      workflowId: w.id,
      status: "pending",
      currentStep: 0,
      payloadJson: JSON.stringify(opts.payload || {}),
      actorId: opts.actorId || null,
    })),
  });
  return { started: workflows.length };
}
