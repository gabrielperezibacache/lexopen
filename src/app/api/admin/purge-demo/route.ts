import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireRole } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  PURGE_CONFIRM_PHRASE,
  detectDemoDataset,
  purgeDemoData,
} from "@/lib/demo-purge";

export async function GET() {
  try {
    await requireRole("admin");
    const detection = await detectDemoDataset(prisma);
    return NextResponse.json({
      ...detection,
      confirmPhrase: PURGE_CONFIRM_PHRASE,
      hint: "Tras purgar, configure LEXOPEN_BOOTSTRAP_TOKEN y abra /setup (Desktop o ?token= de un solo uso)",
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const admin = await requireRole("admin");
    const body = await parseBody(
      req,
      z.object({
        confirm: z.string().min(1).max(80),
        keepCatalogs: z.boolean().optional(),
      })
    );
    if (body.confirm.trim() !== PURGE_CONFIRM_PHRASE) {
      return NextResponse.json(
        {
          error: `Escriba exactamente: ${PURGE_CONFIRM_PHRASE}`,
        },
        { status: 400 }
      );
    }

    const before = await detectDemoDataset(prisma);
    const result = await purgeDemoData(prisma, {
      keepCatalogs: body.keepCatalogs !== false,
    });

    // Auditoría best-effort: puede fallar si auditEvent ya se borró.
    try {
      await writeAudit({
        action: "purge_demo",
        entityType: "Organization",
        entityId: "all",
        actorId: admin.id,
        before,
        after: {
          deletedKeys: Object.keys(result.deleted).length,
          keptCatalogs: result.keptCatalogs,
          needsSetup: result.needsSetup,
        },
      });
    } catch {
      /* BD ya vacía de audit */
    }

    return NextResponse.json({
      ok: true,
      ...result,
      before,
      next:
        "Defina LEXOPEN_BOOTSTRAP_TOKEN en el entorno y abra /setup (Desktop o enlace ?token= de un solo uso; el proxy lo convierte en cookie). Desactive LEXOPEN_DEMO_SWITCHER, HERMES_ALLOW_DEMO y PJUD_ALLOW_DEMO.",
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
