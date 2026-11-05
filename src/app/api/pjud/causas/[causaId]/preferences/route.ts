import { assertPjudManagementEnabled } from "@/lib/causas/management-mode";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseKnowledgeBody as parseBoundedBody } from "@/lib/knowledge/route-body";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { assertCausaCapability } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { writeAuditStrict } from "@/lib/audit";
const settings = z.object({ enabled: z.boolean(), downloadDocuments: z.boolean(), intervalMinutes: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(180), z.literal(360), z.literal(1440)]) }).strict();
export async function POST(request: Request, context: { params: Promise<{ causaId: string }> }) {
  try {
    assertCsrf(request); const user = await requireStaff(); await assertPjudManagementEnabled(); const { causaId } = await context.params;
    if (Number(request.headers.get("content-length") || 0) > 1024) return NextResponse.json({ error: "Solicitud demasiado grande" }, { status: 413 });
    const input = await parseBoundedBody(request, settings, 1024);
    await prisma.$transaction(async tx => {
      await assertPjudManagementEnabled(tx);
      await tx.$queryRaw`SELECT id FROM "Causa" WHERE id = ${causaId} FOR UPDATE`;
      const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
      await assertCausaCapability(causaId, actor, "causa.write", tx);
      await tx.causa.update({ where: { id: causaId }, data: { pjudMonitoreoActivo: input.enabled, pjudDocumentDownloadsEnabled: input.downloadDocuments, ...(input.downloadDocuments ? { pjudDocumentDownloadOwnerId: user.id } : {}), pjudSyncIntervalMinutes: input.intervalMinutes, pjudNextSyncAt: input.enabled ? new Date() : null, ...(!input.enabled ? { pjudLastSyncStatus: "disabled", pjudLastSyncNote: "Actualización pausada por el profesional." } : {}) } });
      await writeAuditStrict({ actorId: user.id, action: "pjud.preferences", entityType: "Causa", entityId: causaId, after: input }, tx);
    });
    return NextResponse.json({ enabled: input.enabled, downloadDocuments: input.downloadDocuments, intervalMinutes: input.intervalMinutes }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) { return handleRouteError(error); }
}
