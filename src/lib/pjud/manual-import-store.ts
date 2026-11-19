import { randomUUID } from "node:crypto";
import type { PjudManualImport, Prisma } from "@prisma/client";
import { assertCausaCapability } from "@/lib/auth/causa-access";
import { isStaff } from "@/lib/auth/rbac";
import { httpError } from "@/lib/auth/access";
import { assertPjudManagementEnabled } from "@/lib/causas/management-mode";
import { prisma } from "@/lib/db";
import { writeAuditStrict } from "@/lib/audit";
import { pjudDocDownloadDelayMs, pjudDocDownloadMaxPerRun } from "./pdf-backup";

const SLOT = "manual";
export const LEASE_MS = 90_000;
type Db = Prisma.TransactionClient;

export type CausaDocImportStatus = {
  causaId: string; status: "idle" | "running" | "done" | "failed"; phase: "idle" | "scrape" | "download" | "done";
  total: number; completed: number; saved: number; skipped: number; failed: number;
  currentLabel: string | null; note: string | null; delayMs: number; maxPerRun: number;
  startedAt: string | null; finishedAt: string | null;
};

function publicStatus(causaId: string, row?: PjudManualImport | null): CausaDocImportStatus {
  const saved = row?.savedIds.length ?? 0, skipped = row?.skippedIds.length ?? 0, failed = row?.failedIds.length ?? 0;
  return {
    causaId, status: (row?.status ?? "idle") as CausaDocImportStatus["status"],
    phase: (row?.phase ?? "idle") as CausaDocImportStatus["phase"],
    saved, skipped, failed, completed: saved + skipped + failed, total: Math.max(row?.total ?? 0, saved + skipped + failed),
    currentLabel: row?.currentLabel ?? null, note: row?.note ?? null,
    delayMs: row?.delayMs ?? pjudDocDownloadDelayMs(), maxPerRun: row?.maxPerRun ?? pjudDocDownloadMaxPerRun(),
    startedAt: row?.startedAt.toISOString() ?? null, finishedAt: row?.finishedAt?.toISOString() ?? null,
  };
}

export async function getCausaDocImportStatus(causaId: string) {
  return publicStatus(causaId, await prisma.pjudManualImport.findFirst({ where: { causaId }, orderBy: [{ startedAt: "desc" }, { id: "desc" }] }));
}

export async function authorizeManualImport(causaId: string, actorId: string, db: Db = prisma) {
  await assertPjudManagementEnabled(db);
  if (process.env.PJUD_DOC_DOWNLOADS?.trim() === "0") throw httpError("Las descargas PJUD están desactivadas en el Host.", 409);
  const actor = await db.user.findUniqueOrThrow({
    where: { id: actorId }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true },
  });
  if (!isStaff(actor.role)) throw httpError("Se requiere acceso del personal del estudio.", 403);
  await assertCausaCapability(causaId, actor, "causa.write", db);
}

export async function startCausaDocImport(causaId: string, actorId: string) {
  return prisma.$transaction(async tx => {
    // Enqueue and audit atomically. Concurrent requests across Host processes see the same slot.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(784512, 1)`;
    await authorizeManualImport(causaId, actorId, tx);
    const active = await tx.pjudManualImport.findUnique({ where: { activeSlot: SLOT } });
    if (active) {
      const same = active.causaId === causaId;
      return { started: false, alreadyRunning: same, globalBusy: !same,
        status: same ? publicStatus(causaId, active) : { ...publicStatus(causaId), note: "Ya hay una descarga de documentos en curso." } };
    }
    const row = await tx.pjudManualImport.create({ data: {
      causaId, actorId, activeSlot: SLOT, maxPerRun: pjudDocDownloadMaxPerRun(), delayMs: pjudDocDownloadDelayMs(),
      note: "Descarga en cola.",
    } });
    await writeAuditStrict({ actorId, action: "pjud.docs.import.start", entityType: "Causa", entityId: causaId, after: { importId: row.id } }, tx);
    return { started: true, alreadyRunning: false, globalBusy: false, status: publicStatus(causaId, row) };
  });
}

export async function claimManualImport(causaId?: string) {
  const now = new Date(), token = randomUUID();
  const claim = await prisma.pjudManualImport.updateMany({
    where: { activeSlot: SLOT, causaId, OR: [{ leaseToken: null }, { leaseExpiresAt: { lte: now } }] },
    data: { leaseToken: token, leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
  });
  if (!claim.count) return null;
  const row = await prisma.pjudManualImport.findFirst({ where: { activeSlot: SLOT, leaseToken: token } });
  return row && { ...row, leaseToken: token };
}

export type ClaimedManualImport = NonNullable<Awaited<ReturnType<typeof claimManualImport>>>;

export async function updateClaim(job: ClaimedManualImport, data: Prisma.PjudManualImportUpdateManyMutationInput, db: Db = prisma) {
  const now = new Date();
  const update = await db.pjudManualImport.updateMany({
    where: { id: job.id, activeSlot: SLOT, leaseToken: job.leaseToken, leaseExpiresAt: { gt: now } },
    data: { leaseExpiresAt: new Date(now.getTime() + LEASE_MS), ...data },
  });
  if (!update.count) throw new Error("El lote ya tiene otro responsable de ejecución.");
}

export function finishClaim(job: ClaimedManualImport, status: "done" | "failed", note: string) {
  return updateClaim(job, { status, note, phase: "done", activeSlot: null, currentLabel: null,
    leaseToken: null, leaseExpiresAt: null, finishedAt: new Date() });
}
