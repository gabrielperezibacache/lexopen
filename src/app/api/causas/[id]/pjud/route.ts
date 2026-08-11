import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import {
  providerStatusPublic,
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
        pjudMonitoreoActivo: true,
        pjudLastSyncAt: true,
        pjudLastSyncStatus: true,
        pjudLastSyncNote: true,
        pjudExternalKey: true,
      },
    });
    if (!causa) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json({ causa, provider: providerStatusPublic() });
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
        action: z.enum(["sync", "enable", "disable"]),
      })
    );

    if (body.action === "enable" || body.action === "disable") {
      const causa = await setMonitoreoActivo(id, body.action === "enable");
      await writeAudit({
        actorId: user.id,
        action: `pjud.monitor.${body.action}`,
        entityType: "Causa",
        entityId: id,
        after: { pjudMonitoreoActivo: causa.pjudMonitoreoActivo },
      });
      return NextResponse.json({ ok: true, causa });
    }

    // sync: force even if disabled so first sync can activate via enable first —
    // require enabled OR enable automatically on explicit sync (CaseTracking UX)
    await setMonitoreoActivo(id, true);
    const result = await syncCausaPjud(id, { actorId: user.id, force: true });
    await writeAudit({
      actorId: user.id,
      action: "pjud.sync",
      entityType: "Causa",
      entityId: id,
      after: result,
    });
    return NextResponse.json(result);
  } catch (e) {
    return handleRouteError(e);
  }
}
