import { prisma } from "@/lib/db";

export type WriteAuditOpts = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  /**
   * When true, persistence failures throw (mutaciones sensibles).
   * Default false = best-effort with console error.
   */
  strict?: boolean;
};

export async function writeAudit(opts: WriteAuditOpts) {
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
    if (opts.strict) {
      const err = new Error(
        "No se pudo registrar la auditoría; la operación se abortó"
      ) as Error & { status: number; cause?: unknown };
      err.status = 500;
      err.cause = e;
      throw err;
    }
  }
}

/** Persist audit or fail the mutation (auth, purge, billing, ClaveÚnica, conflicts). */
export async function writeAuditStrict(opts: Omit<WriteAuditOpts, "strict">) {
  return writeAudit({ ...opts, strict: true });
}
