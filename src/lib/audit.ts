import { prisma } from "@/lib/db";

export async function writeAudit(opts: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}) {
  try {
    await prisma.auditEvent.create({
      data: {
        actorId: opts.actorId || undefined,
        action: opts.action,
        entityType: opts.entityType,
        entityId: opts.entityId || undefined,
        beforeJson: opts.before ? JSON.stringify(opts.before) : undefined,
        afterJson: opts.after ? JSON.stringify(opts.after) : undefined,
        ip: opts.ip || undefined,
      },
    });
  } catch (e) {
    console.error("audit write failed", e);
  }
}
