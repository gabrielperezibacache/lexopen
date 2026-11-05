/** Durable original-download receipts. Browser contexts and cookies never enter this queue. */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getCaseManagementMode } from "@/lib/causas/management-mode";
import { assertCausaCapability } from "@/lib/auth/causa-access";
import { fetchSafeOutbound } from "@/lib/net/safe-url";
import { pjudDocumentRefHash } from "./document-identity";
import { ingestPjudDocumentBuffer, isBackupableDocumentoRef, pjudDocDownloadMaxPerRun, readPjudDocumentResponse } from "./pdf-backup";

export async function enqueuePjudDocumentJobs(causaId: string, options: { actorId?: string | null; waitingLogin?: boolean } = {}) {
  if (await getCaseManagementMode() !== "pjud_cl") return { created: 0 };
  const cause = await prisma.causa.findUniqueOrThrow({ where: { id: causaId }, select: { pjudMonitoreoActivo: true, pjudDocumentDownloadsEnabled: true, pjudDocumentDownloadOwnerId: true } });
  if (!cause.pjudMonitoreoActivo || !cause.pjudDocumentDownloadsEnabled || !cause.pjudDocumentDownloadOwnerId) return { created: 0 };
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: cause.pjudDocumentDownloadOwnerId }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
  await assertCausaCapability(causaId, owner, "causa.write");
  const rows = await prisma.causaMovimiento.findMany({ where: { causaId, documentoRef: { not: null }, NOT: [{ documentoRef: { startsWith: "doc:" } }, { documentoRef: { startsWith: "lexopen:" } }] }, select: { id: true, documentoRef: true, documentJob: { select: { id: true, status: true, sourceRefHash: true, actorId: true } } }, orderBy: { id: "asc" }, take: 10_000 });
  const pending = [];
  let created = 0;
  for (const row of rows) {
    const ref = row.documentoRef?.trim();
    if (!ref) continue;
    const sourceRefHash = pjudDocumentRefHash(causaId, row.id, ref), prior = row.documentJob;
    if (prior?.status === "saved") continue; // Removing an original is deliberate; never recreate it silently.
    const status = options.waitingLogin || !isBackupableDocumentoRef(ref) ? "waiting_login" : "pending";
    if (!prior) {
      pending.push({ causaId, movimientoId: row.id, actorId: owner.id, sourceRefHash, status });
    } else if (prior.sourceRefHash !== sourceRefHash || prior.actorId !== owner.id) {
      await prisma.pjudDocumentJob.updateMany({ where: { id: prior.id, status: { notIn: ["saved", "running"] } }, data: { sourceRefHash, actorId: owner.id, status, attempts: 0, nextAttemptAt: new Date(), lastError: null, lastErrorCode: null } });
    }
  }
  for (let index = 0; index < pending.length; index += 500) created += (await prisma.pjudDocumentJob.createMany({ data: pending.slice(index, index + 500), skipDuplicates: true })).count;
  return { created };
}
export async function pjudDocumentProgress(causaId: string) {
  const groups = await prisma.pjudDocumentJob.groupBy({ by: ["status"], where: { causaId }, _count: true });
  const removed = await prisma.pjudDocumentJob.count({ where: { causaId, status: "saved", documentoId: null } });
  const count = (status: string) => groups.find(row => row.status === status)?._count || 0;
  return { saved: count("saved") - removed, removed, pending: count("pending") + count("running"), waitingLogin: count("waiting_login"), failed: count("failed"), total: groups.reduce((sum, row) => sum + row._count, 0) };
}
/** Scheduler entrypoint; authenticated-only files remain waiting until the next manual OJV login. */
export async function processPendingPjudDocumentJobs(options: { limit?: number; causaId?: string; now?: Date; fetch?: typeof fetchSafeOutbound; enqueue?: Parameters<typeof ingestPjudDocumentBuffer>[0]["enqueue"] } = {}) {
  if (process.env.PJUD_DOC_DOWNLOADS?.trim() === "0") return [];
  if (await getCaseManagementMode() !== "pjud_cl") return [];
  const now = options.now || new Date();
  await prisma.pjudDocumentJob.updateMany({ where: { actorId: null, status: { in: ["pending", "failed", "running"] }, ...(options.causaId ? { causaId: options.causaId } : {}) }, data: { status: "waiting_login", lastErrorCode: "owner_required", lastError: "Un profesional debe autorizar las descargas de esta causa.", leaseToken: null, leaseExpiresAt: null } });
  const jobs = await prisma.pjudDocumentJob.findMany({ where: { actorId: { not: null }, ...(options.causaId ? { causaId: options.causaId } : {}), causa: { pjudMonitoreoActivo: true, pjudDocumentDownloadsEnabled: true }, OR: [{ status: { in: ["pending", "failed"] }, nextAttemptAt: { lte: now } }, { status: "running", leaseExpiresAt: { lte: now } }] }, orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }], take: Math.min(Math.max(options.limit || pjudDocDownloadMaxPerRun(), 1), 50) });
  const receipts = [];
  for (const job of jobs) {
    if (await getCaseManagementMode() !== "pjud_cl") break;
    const leaseToken = randomUUID();
    const claim = await prisma.pjudDocumentJob.updateMany({ where: { id: job.id, sourceRefHash: job.sourceRefHash, OR: [{ status: { in: ["pending", "failed"] }, nextAttemptAt: { lte: now } }, { status: "running", leaseExpiresAt: { lte: now } }] }, data: { status: "running", leaseToken, leaseExpiresAt: new Date(Date.now() + 90_000), attempts: { increment: 1 } } });
    if (!claim.count) continue;
    let status = "failed", lastErrorCode = "download_failed", lastError = "No se pudo guardar este documento; volveremos a intentarlo.";
    try {
      const cause = await prisma.causa.findUniqueOrThrow({ where: { id: job.causaId }, select: { pjudMonitoreoActivo: true, pjudDocumentDownloadsEnabled: true, pjudDocumentDownloadOwnerId: true } });
      if (!cause.pjudMonitoreoActivo || !cause.pjudDocumentDownloadsEnabled || !job.actorId || cause.pjudDocumentDownloadOwnerId !== job.actorId) throw new Error("authorization changed");
      if (job.actorId) {
        const actor = await prisma.user.findUniqueOrThrow({ where: { id: job.actorId }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
        await assertCausaCapability(job.causaId, actor, "causa.write");
      }
      const movement = await prisma.causaMovimiento.findUniqueOrThrow({ where: { id: job.movimientoId } });
      const ref = movement.documentoRef || "";
      if (movement.causaId !== job.causaId || pjudDocumentRefHash(job.causaId, movement.id, ref) !== job.sourceRefHash) { lastErrorCode = "source_changed"; throw new Error("source changed"); }
      if (!isBackupableDocumentoRef(ref)) { status = "waiting_login"; lastErrorCode = "login_required"; throw new Error("login required"); }
      if (await getCaseManagementMode() !== "pjud_cl") { status = "paused"; lastErrorCode = "management_mode_paused"; throw new Error("management paused"); }
      const response = await (options.fetch || fetchSafeOutbound)(ref, { allowHttp: process.env.NODE_ENV !== "production", signal: AbortSignal.timeout(45_000), headers: { Accept: "application/pdf,*/*" } });
      if ([401, 403].includes(response.status) || /text\/html/i.test(response.headers.get("content-type") || "")) { await response.body?.cancel(); status = "waiting_login"; lastErrorCode = "login_required"; throw new Error("login required"); }
      if (!response.ok) { await response.body?.cancel(); throw new Error("download failed"); }
      const bytes = await readPjudDocumentResponse(response);
      const documentoId = await ingestPjudDocumentBuffer({ causaId: job.causaId, movimientoId: movement.id, bytes, filename: `pjud-${movement.folio || movement.id}.pdf`, esReceptor: movement.esReceptor, mimeHint: response.headers.get("content-type"), receiptLeaseToken: leaseToken, enqueue: options.enqueue });
      if (!documentoId) { status = "waiting_login"; lastErrorCode = "document_unavailable"; throw new Error("not a verified document"); }
      status = "saved";
    } catch {
      if (status === "waiting_login") lastError = "Este documento necesita una sesión OJV vigente. Ingrese con ClaveÚnica para continuar.";
    }
    if (status !== "saved") await prisma.pjudDocumentJob.updateMany({ where: { id: job.id, leaseToken, status: "running" }, data: { status, lastErrorCode, lastError, nextAttemptAt: new Date(Date.now() + Math.min(1440, 2 ** Math.min(job.attempts, 8) * 5) * 60_000), leaseToken: null, leaseExpiresAt: null } });
    receipts.push({ causaId: job.causaId, movimientoId: job.movimientoId, status });
  }
  return receipts;
}
