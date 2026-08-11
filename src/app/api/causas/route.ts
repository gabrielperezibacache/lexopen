import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  handleRouteError,
  assertCsrf,
  jsonError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { causaCreateSchema } from "@/lib/schemas";
import { validarRit, validarRuc, validarRut, normalizarRut } from "@/lib/chile";
import { checkConflicts } from "@/lib/conflict";
import { writeAudit } from "@/lib/audit";
import { parseLocalDateInput } from "@/lib/minutas";
import { publicUserSelect } from "@/lib/auth/public-user";
import { canSeeConfidential } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const materia = searchParams.get("materia");
    const estado = searchParams.get("estado");

    const causas = await prisma.causa.findMany({
      where: {
        AND: [
          q
            ? {
                OR: [
                  { titulo: { contains: q, mode: "insensitive" } },
                  { rit: { contains: q, mode: "insensitive" } },
                  { ruc: { contains: q, mode: "insensitive" } },
                  { caratula: { contains: q, mode: "insensitive" } },
                  { tribunal: { contains: q, mode: "insensitive" } },
                ],
              }
            : {},
          materia ? { materia } : {},
          estado ? { estado } : {},
        ],
      },
      include: {
        cliente: true,
        abogado: { select: publicUserSelect },
        plazos: {
          where: { estado: "pendiente" },
          orderBy: { fechaLimite: "asc" },
          take: 2,
        },
        _count: { select: { documentos: true, partes: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(causas);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, causaCreateSchema);

    if (body.conflictOverride && !canSeeConfidential(user.role)) {
      return jsonError("Solo abogados o admin pueden omitir un conflicto bloqueante", 403);
    }

    if (body.rit && !validarRit(body.rit)) {
      return jsonError("RIT inválido (ej. C-4521-2025)", 400);
    }
    if (body.ruc && !validarRuc(body.ruc)) {
      return jsonError("RUC inválido", 400);
    }
    for (const p of body.partes || []) {
      if (p.rut && !validarRut(p.rut)) {
        return jsonError(`RUT inválido: ${p.rut}`, 400);
      }
    }

    const conflicts = await checkConflicts({
      partes: (body.partes || []).map((p) => ({
        nombre: p.nombre,
        rut: p.rut,
      })),
    });
    const blocked = conflicts.filter((c) => c.severity === "blocked");
    if (blocked.length && !body.conflictOverride) {
      return NextResponse.json(
        {
          error: "Posible conflicto de interés detectado",
          conflicts,
        },
        { status: 409 }
      );
    }

    const causa = await prisma.causa.create({
      data: {
        titulo: body.titulo,
        rit: body.rit || null,
        ruc: body.ruc || null,
        tribunal: body.tribunal,
        materia: body.materia,
        procedimiento: body.procedimiento || null,
        estado: body.estado || "activa",
        etapa: body.etapa || "ingreso",
        caratula: body.caratula || null,
        resumen: body.resumen || null,
        sala: body.sala || null,
        cuaderno: body.cuaderno || null,
        abogadoContraparte: body.abogadoContraparte || null,
        fechaNotificacion: parseLocalDateInput(body.fechaNotificacion || undefined),
        fechaIngreso: new Date(),
        clienteId: body.clienteId || null,
        abogadoId: body.abogadoId || user.id,
        conflictCheckedAt: new Date(),
        conflictStatus: blocked.length
          ? "blocked"
          : conflicts.length
            ? "warning"
            : "clear",
        conflictNotes: body.conflictNotes || null,
        partes: body.partes?.length
          ? {
              create: body.partes.map((p) => ({
                nombre: p.nombre,
                rut: p.rut ? normalizarRut(p.rut) : null,
                rol: p.rol,
                domicilio: p.domicilio || null,
              })),
            }
          : undefined,
        etapaHistorial: {
          create: { etapa: body.etapa || "ingreso", nota: "Alta de causa" },
        },
      },
      include: { partes: true, cliente: true, abogado: { select: publicUserSelect } },
    });

    await prisma.activity.create({
      data: {
        tipo: "estado",
        mensaje: `Nueva causa creada: ${causa.titulo}`,
        causaId: causa.id,
        userId: user.id,
      },
    });
    await writeAudit({
      actorId: user.id,
      action: "causa.create",
      entityType: "Causa",
      entityId: causa.id,
      after: { titulo: causa.titulo, rit: causa.rit, conflicts },
    });

    return NextResponse.json({ ...causa, conflicts }, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
