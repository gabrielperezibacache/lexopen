import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireRole } from "@/lib/api";
import { writeAuditStrict } from "@/lib/audit";
import {
  clearClaveUnicaCredentials,
  getClaveUnicaStatus,
  saveClaveUnicaCredentials,
  setClaveUnicaEnabled,
} from "@/lib/pjud/claveunica";

export async function GET() {
  try {
    await requireRole("admin");
    return NextResponse.json(await getClaveUnicaStatus());
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireRole("admin");
    const body = await parseBody(
      req,
      z.object({
        action: z.enum(["save", "clear", "enable", "disable"]),
        rut: z.string().trim().min(3).max(20).optional(),
        password: z.string().min(4).max(200).optional(),
      })
    );

    if (body.action === "save") {
      if (!body.rut || !body.password) {
        return NextResponse.json(
          { error: "RUT y contraseña ClaveÚnica son requeridos" },
          { status: 400 }
        );
      }
      await saveClaveUnicaCredentials({
        rut: body.rut,
        password: body.password,
        enabled: true,
      });
      await writeAuditStrict({
        actorId: user.id,
        action: "pjud.claveunica.save",
        entityType: "FirmSettings",
        after: { rutMasked: true },
      });
      return NextResponse.json(await getClaveUnicaStatus());
    }

    if (body.action === "clear") {
      await clearClaveUnicaCredentials();
      await writeAuditStrict({
        actorId: user.id,
        action: "pjud.claveunica.clear",
        entityType: "FirmSettings",
      });
      return NextResponse.json(await getClaveUnicaStatus());
    }

    await setClaveUnicaEnabled(body.action === "enable");
    await writeAuditStrict({
      actorId: user.id,
      action: `pjud.claveunica.${body.action}`,
      entityType: "FirmSettings",
    });
    return NextResponse.json(await getClaveUnicaStatus());
  } catch (e) {
    return handleRouteError(e);
  }
}
