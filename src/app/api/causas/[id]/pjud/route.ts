import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { writeAuditStrict } from "@/lib/audit";
import {
  clearCausaPjudSyncMessages,
  providerStatusPublicAsync,
  setMonitoreoActivo,
  syncCausaPjud,
} from "@/lib/pjud/sync";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireStaff();
    const { id } = await params;
    const causa = await prisma.causa.findUnique({
      where: { id },
      select: {
        id: true,
        rit: true,
        tribunal: true,
        sala: true,
        pjudMonitoreoActivo: true,
        pjudLastSyncAt: true,
        pjudNextSyncAt: true,
        pjudLastSyncStatus: true,
        pjudLastSyncNote: true,
        pjudExternalKey: true,
        pjudFailCount: true,
      },
    });
    if (!causa) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    const recentJobs = await prisma.pjudSyncJob.findMany({
      where: { causaId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return NextResponse.json({
      causa,
      jobs: recentJobs,
      provider: await providerStatusPublicAsync(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const body = await parseBody(
      req,
      z.object({
        action: z.enum(["sync", "enable", "disable", "retry", "clear_errors"]),
      })
    );

    if (body.action === "enable" || body.action === "disable") {
      const causa = await setMonitoreoActivo(id, body.action === "enable");
      await writeAuditStrict({
        actorId: user.id,
        action: `pjud.monitor.${body.action}`,
        entityType: "Causa",
        entityId: id,
        after: { pjudMonitoreoActivo: causa.pjudMonitoreoActivo },
      });
      return NextResponse.json({ ok: true, causa });
    }

    if (body.action === "clear_errors") {
      const causa = await clearCausaPjudSyncMessages(id);
      await writeAuditStrict({
        actorId: user.id,
        action: "pjud.clear_errors",
        entityType: "Causa",
        entityId: id,
        after: {
          pjudLastSyncNote: causa.pjudLastSyncNote,
          pjudFailCount: causa.pjudFailCount,
          pjudLastSyncStatus: causa.pjudLastSyncStatus,
        },
      });
      return NextResponse.json({ ok: true, causa });
    }

    await setMonitoreoActivo(id, true);
    const result = await syncCausaPjud(id, {
      actorId: user.id,
      force: true,
      trigger: body.action === "retry" ? "retry" : "manual",
    });
    await writeAuditStrict({
      actorId: user.id,
      action: body.action === "retry" ? "pjud.retry" : "pjud.sync",
      entityType: "Causa",
      entityId: id,
      after: result,
    });
    return NextResponse.json(result);
  } catch (e) {
    return handleRouteError(e);
  }
}
