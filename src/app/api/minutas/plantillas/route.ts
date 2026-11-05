import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireRole,
  requireStaff,
} from "@/lib/api";
import { prisma } from "@/lib/db";
import { parseMinutaTemplate } from "@/lib/minutas/template";

const plantillaSchema = z.object({
  tipo: z.string().min(2),
  nombre: z.string().min(2),
  materia: z.string().optional().nullable(),
  bodyJson: z.string().max(60000).superRefine((value, context) => { try { parseMinutaTemplate(value); } catch (error) { context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Revisa el contenido de la plantilla" }); } }).optional(),
});

export async function GET() {
  try {
    await requireStaff();
    const plantillas = await prisma.minutaPlantilla.findMany({
      orderBy: [{ tipo: "asc" }, { nombre: "asc" }],
    });
    return NextResponse.json(plantillas);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    assertCsrf(req);
    await requireRole("admin", "abogado");
    const body = await parseBody(req, plantillaSchema);
    const plantilla = await prisma.minutaPlantilla.create({
      data: {
        tipo: body.tipo,
        nombre: body.nombre,
        materia: body.materia || null,
        bodyJson: body.bodyJson || "{}",
      },
    });
    return NextResponse.json(plantilla, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    assertCsrf(req);
    await requireRole("admin", "abogado");
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }
    await prisma.minutaPlantilla.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
