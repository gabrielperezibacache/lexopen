import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { canSome } from "@/lib/auth/permissions";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { writeAuditStrict } from "@/lib/audit";

export type CaseManagementMode = "manual" | "pjud_cl";
type Client = PrismaClient | Prisma.TransactionClient;
export const PJUD_MODE_PAUSED_NOTE = "Seguimiento judicial pausado por la modalidad de gestión manual.";
export async function getCaseManagementMode(client: Client = prisma): Promise<CaseManagementMode> {
  const settings = await client.firmSettings.findFirst({ select: { caseManagementMode: true } });
  return settings?.caseManagementMode === "pjud_cl" ? "pjud_cl" : "manual";
}
export async function assertPjudManagementEnabled(client: Client = prisma) {
  if (await getCaseManagementMode(client) !== "pjud_cl") throw httpError("El seguimiento judicial de Chile está desactivado. Puedes elegirlo en Configuración → Gestión de causas.", 409);
}
/** Paused jobs keep their original identities and receipts; case preferences and files are untouched. */
export async function pausePjudManagementJobs(client: Client = prisma) {
  await client.pjudSyncJob.updateMany({ where: { status: { in: ["pending", "running"] } }, data: { status: "paused", note: PJUD_MODE_PAUSED_NOTE, lastError: null } });
  await client.pjudDocumentJob.updateMany({ where: { status: { in: ["pending", "running", "failed"] } }, data: { status: "paused", lastErrorCode: "management_mode_paused", lastError: PJUD_MODE_PAUSED_NOTE, leaseToken: null, leaseExpiresAt: null } });
  await client.firmSettings.updateMany({ where: { claveUnicaLastSyncStatus: "running" }, data: { claveUnicaLastSyncStatus: "paused", claveUnicaLastSyncNote: PJUD_MODE_PAUSED_NOTE } });
}
export async function updateCaseManagementMode(mode: CaseManagementMode, user: CausaAccessUser, client: PrismaClient = prisma) {
  if (mode !== "manual" && mode !== "pjud_cl") throw httpError("Elige una modalidad válida.", 400);
  await client.$transaction(async tx => {
    const actor = await tx.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
    if (!actor || actor.role !== "admin" || !canSome(actor, "host.admin")) throw httpError("Sólo la administración puede cambiar la modalidad de causas.", 403);
    const before = await getCaseManagementMode(tx), organization = await tx.organization.findFirst({ select: { id: true } }) || await tx.organization.create({ data: {}, select: { id: true } });
    await tx.firmSettings.upsert({ where: { organizationId: organization.id }, create: { organizationId: organization.id, caseManagementMode: mode }, update: { caseManagementMode: mode } });
    if (mode === "manual") await pausePjudManagementJobs(tx);
    else {
      await tx.pjudSyncJob.updateMany({ where: { status: "paused", trigger: { not: "manual-session" } }, data: { status: "pending", note: null, lastError: null, startedAt: null, finishedAt: null } });
      await tx.pjudSyncJob.updateMany({ where: { status: "paused", trigger: "manual-session" }, data: { status: "failed", note: "Vuelve a ingresar con ClaveÚnica para continuar esta actualización.", finishedAt: new Date() } });
      await tx.pjudDocumentJob.updateMany({ where: { status: "paused", lastErrorCode: "management_mode_paused" }, data: { status: "pending", lastErrorCode: null, lastError: null, nextAttemptAt: new Date() } });
    }
    await writeAuditStrict({ actorId: actor.id, action: "settings.case-management", entityType: "FirmSettings", entityId: organization.id, before: { mode: before }, after: { mode } }, tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (mode === "manual") {
    const { manualOjvSessions } = await import("@/lib/pjud/manual-session-manager");
    await manualOjvSessions.dispose();
  }
  return { mode: await getCaseManagementMode(client) };
}
