import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import {
  addCausaByRol,
  buscarPorRut,
  previewRolLookup,
} from "@/lib/pjud/lookup";
import { TRIBUNALES_CHILE } from "@/lib/chile";

export async function GET() {
  try {
    await requireStaff();
    return NextResponse.json({
      tribunales: TRIBUNALES_CHILE,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(
      req,
      z.discriminatedUnion("action", [
        z.object({
          action: z.literal("add-rol"),
          rit: z.string().trim().min(3).max(40),
          tribunal: z.string().trim().min(3).max(255),
          titulo: z.string().trim().max(500).optional(),
          ruc: z.string().trim().max(40).optional().nullable(),
          materia: z.string().trim().max(100).optional(),
          syncNow: z.boolean().optional(),
        }),
        z.object({
          action: z.literal("preview-rol"),
          rit: z.string().trim().min(3).max(40),
          tribunal: z.string().trim().min(3).max(255),
          ruc: z.string().trim().max(40).optional().nullable(),
        }),
        z.object({
          action: z.literal("buscar-rut"),
          rut: z.string().trim().min(7).max(20),
        }),
      ])
    );

    if (body.action === "preview-rol") {
      const preview = await previewRolLookup({
        rit: body.rit,
        tribunal: body.tribunal,
        ruc: body.ruc,
      });
      return NextResponse.json(preview);
    }

    if (body.action === "buscar-rut") {
      const causas = await buscarPorRut(body.rut);
      return NextResponse.json({ causas, count: causas.length });
    }

    const result = await addCausaByRol({
      rit: body.rit,
      tribunal: body.tribunal,
      titulo: body.titulo,
      ruc: body.ruc,
      materia: body.materia,
      actorId: user.id,
      syncNow: body.syncNow,
    });
    await writeAudit({
      actorId: user.id,
      action: "pjud.add-rol",
      entityType: "Causa",
      entityId: result.causaId,
      after: result,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (e) {
    return handleRouteError(e);
  }
}
