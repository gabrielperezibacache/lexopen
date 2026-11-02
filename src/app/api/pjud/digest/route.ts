import { can } from "@/lib/auth/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDigestStatus, runPjudDigest } from "@/lib/pjud/digest";
import { providerStatusPublic } from "@/lib/pjud/sync";
import { verifyCronSecret } from "@/lib/security/cron-secret";

export async function GET() {
  try {
    await requireStaff();
    return NextResponse.json({
      digest: await getDigestStatus(),
      provider: providerStatusPublic(),
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
      if (!can(user, "causa.override_walls") || !can(user, "causa.write")) return NextResponse.json({ error: "La sincronización global requiere supervisión del estudio" }, { status: 403 });
      actorId = user.id;
    }

    const body = await parseBody(
      req,
      z
        .object({
          dryRun: z.boolean().optional(),
        })
        .optional()
    ).catch(() => ({ dryRun: false }));

    const result = await runPjudDigest({ dryRun: Boolean(body?.dryRun) });
    if (actorId) {
      await writeAudit({
        actorId,
        action: "pjud.digest",
        entityType: "FirmSettings",
        after: result,
      });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return handleRouteError(e);
  }
}
