import type { Prisma, Task } from "@prisma/client";

/** Run inside the mutation transaction, once when a task enters done. */
export async function applyTaskCompletionEffects(task: Task, actorId: string, tx: Prisma.TransactionClient) {
  if (task.siteId) {
    const workflows = await tx.workflow.findMany({ where: { siteId: task.siteId, active: true, triggerType: "task_done" }, select: { id: true } });
    if (workflows.length) await tx.workflowInstance.createMany({ data: workflows.map(w => ({ workflowId: w.id, status: "pending", actorId, payloadJson: JSON.stringify({ taskId: task.id }) })) });
  }
  if (task.rrule) {
    // Inherit the committed edit, including reassignment and case changes.
    const dueDate = new Date(task.dueDate || new Date());
    const dateOnly = Boolean(task.dueDate) && dueDate.getUTCHours() === 0 && dueDate.getUTCMinutes() === 0 && dueDate.getUTCSeconds() === 0 && dueDate.getUTCMilliseconds() === 0;
    const interval = Number(/INTERVAL=(\d+)/.exec(task.rrule)?.[1] || 1);
    // Date-only tasks use the UTC-midnight sentinel throughout the workspace.
    // Host-local setters would turn it into an instant on the previous day at DST.
    if (task.rrule.startsWith("FREQ=MONTHLY")) {
      if (dateOnly) dueDate.setUTCMonth(dueDate.getUTCMonth() + interval);
      else dueDate.setMonth(dueDate.getMonth() + interval);
    } else {
      const days = interval * (task.rrule.startsWith("FREQ=WEEKLY") ? 7 : 1);
      if (dateOnly) dueDate.setUTCDate(dueDate.getUTCDate() + days);
      else dueDate.setDate(dueDate.getDate() + days);
    }
    await tx.task.create({ data: { title: task.title, description: task.description, instructions: task.instructions, considerations: task.considerations, priority: task.priority, dueDate, causaId: task.causaId, siteId: task.siteId, clienteId: task.clienteId, assigneeId: task.assigneeId, creatorId: actorId, origen: "manual", rrule: task.rrule } });
  }
}
