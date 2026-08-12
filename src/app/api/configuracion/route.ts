import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, parseBody, requireRole } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1),
  rut: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  direccion: z.string().optional().nullable(),
  emisorRazonSocial: z.string().optional().nullable(),
  emisorRut: z.string().optional().nullable(),
  emisorGiro: z.string().optional().nullable(),
  emisorDireccion: z.string().optional().nullable(),
  defaultRetencionPct: z.coerce.number().min(0).max(1),
  ivaPct: z.coerce.number().min(0).max(1),
  hermesAllowDemo: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    assertCsrf(req);
    await requireRole("admin");
    const body = await parseBody(req, schema);
    const current =
      (await prisma.organization.findFirst({ include: { settings: true } })) ||
      (await prisma.organization.create({ data: {}, include: { settings: true } }));
    const org = await prisma.organization.update({
      where: { id: current.id },
      data: {
        name: body.name,
        rut: body.rut || null,
        email: body.email || null,
        telefono: body.telefono || null,
        direccion: body.direccion || null,
        settings: {
          upsert: {
            create: {
              emisorRazonSocial: body.emisorRazonSocial || null,
              emisorRut: body.emisorRut || null,
              emisorGiro: body.emisorGiro || null,
              emisorDireccion: body.emisorDireccion || null,
              defaultRetencionPct: body.defaultRetencionPct,
              ivaPct: body.ivaPct,
              hermesAllowDemo: Boolean(body.hermesAllowDemo),
            },
            update: {
              emisorRazonSocial: body.emisorRazonSocial || null,
              emisorRut: body.emisorRut || null,
              emisorGiro: body.emisorGiro || null,
              emisorDireccion: body.emisorDireccion || null,
              defaultRetencionPct: body.defaultRetencionPct,
              ivaPct: body.ivaPct,
              hermesAllowDemo: Boolean(body.hermesAllowDemo),
            },
          },
        },
      },
      include: { settings: true },
    });
    return NextResponse.json(org);
  } catch (e) {
    return handleRouteError(e);
  }
}
