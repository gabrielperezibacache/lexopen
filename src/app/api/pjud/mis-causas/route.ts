import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { syncMisCausas, getClaveUnicaStatus } from "@/lib/pjud/claveunica";
import { verifyCronSecret } from "@/lib/security/cron-secret";

export async function GET() {
  try {
    await requireStaff();
    return NextResponse.json({
      status: await getClaveUnicaStatus(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const cron = req.headers.get("x-cron-secret");
    let actorId: string | null = null;
    if (cron) {
      if (!verifyCronSecret(cron)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      assertCsrf(req);
      const user = await requireStaff();
      actorId = user.id;
    }

    const body = await parseBody(
      req,
      z
        .object({
          syncMovimientos: z.boolean().optional(),
        })
        .optional()
    ).catch(() => ({ syncMovimientos: true }));

    const result = await syncMisCausas({
      actorId,
      syncMovimientos: body?.syncMovimientos !== false,
    });

    if (actorId) {
      await writeAudit({
        actorId,
        action: "pjud.mis-causas.sync",
        entityType: "FirmSettings",
        after: {
          listed: result.listed,
          created: result.created,
          linked: result.linked,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      ...result,
      status: await getClaveUnicaStatus(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
