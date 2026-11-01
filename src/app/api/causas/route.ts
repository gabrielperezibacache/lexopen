import {
  assertCsrf,
  handleRouteError,
  jsonError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { parseListLimit } from "@/lib/api/list-limit";
import { writeAuditStrict } from "@/lib/audit";
import { ensureResponsableMiembro, causaAccessWhere as scopedcausaAccessWhere, documentReadWhere as scopeddocumentReadWhere, plazoAccessWhere } from "@/lib/auth/causa-access";
import { can, canSome } from "@/lib/auth/permissions";
import { publicUserSelect } from "@/lib/auth/public-user";
import { isStaff } from "@/lib/auth/rbac";
import { normalizarRut, validarRit, validarRuc, validarRut } from "@/lib/chile";
import { checkConflicts } from "@/lib/conflict";
import { prisma } from "@/lib/db";
import { parseLocalDateInput } from "@/lib/minutas";
import { duplicateCausaWhere } from "@/lib/pjud/causa-origin";
import { causaCreateSchema } from "@/lib/schemas";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const materia = searchParams.get("materia");
    const estado = searchParams.get("estado");
    const limit = parseListLimit(searchParams.get("limit"), {
      default: 200,
      max: 500,
    });

    const causas = await prisma.causa.findMany({
      where: { AND: [scopedcausaAccessWhere(user), {
        AND: [
          scopedcausaAccessWhere(user),
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
      }] },
      include: {
        cliente: true,
        abogado: { select: publicUserSelect },
        site: { select: { id: true } },
        plazos: {
          where: { AND: [plazoAccessWhere(user), { estado: "pendiente" }] },
          orderBy: { fechaLimite: "asc" },
          take: 2,
        },
        _count: { select: { documentos: { where: scopeddocumentReadWhere(user) }, partes: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
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
    if (!canSome(user, "causa.create")) {
      return jsonError("Prohibido: su rol no puede crear causas", 403);
    }
    const body = await parseBody(req, causaCreateSchema);

    if (body.conflictOverride && !can(user, "causa.override_walls")) {
      return jsonError("La coincidencia requiere revisión y autorización de un socio", 403);
    }

    let abogadoId = user.id;
    if (body.abogadoId) {
      const assigned = await prisma.user.findUnique({
        where: { id: body.abogadoId },
        select: { id: true, role: true },
      });
      if (!assigned || !isStaff(assigned.role)) {
        return jsonError("El responsable debe ser un usuario del estudio", 400);
      }
      abogadoId = assigned.id;
    }

    if (body.rit && !validarRit(body.rit)) {
      return jsonError("RIT inválido (ej. C-4521-2025)", 400);
    }
    if (body.ruc && !validarRuc(body.ruc)) {
      return jsonError("RUC inválido", 400);
    }

    const duplicateWhere = duplicateCausaWhere({
      rit: body.rit,
      ruc: body.ruc,
      tribunal: body.tribunal,
    });
    if (duplicateWhere) {
      const existing = await prisma.causa.findFirst({
        where: duplicateWhere,
        select: { id: true, titulo: true, rit: true },
      });
      if (existing) {
        const visible = await prisma.causa.findFirst({ where: { id: existing.id, ...scopedcausaAccessWhere(user) }, select: { id: true } });
        if (!visible) return NextResponse.json({ error: "Existe una coincidencia reservada. Requiere revisión autorizada.", code: "causa_duplicate" }, { status: 409 });
        return NextResponse.json(
          {
            error:
              "Ya existe una causa con el mismo RIT o RUC en ese tribunal",
            code: "causa_duplicate",
            existingId: existing.id,
            id: existing.id,
            titulo: existing.titulo,
            rit: existing.rit,
          },
          { status: 409 }
        );
      }
    }
    for (const p of body.partes || []) {
      if (p.rut && !validarRut(p.rut)) {
        return jsonError(`RUT inválido: ${p.rut}`, 400);
      }
    }

    const risk = await checkConflicts({
      user,
      partes: (body.partes || []).map((p) => ({
        nombre: p.nombre,
        rut: p.rut,
      })),
    });
    const conflicts = risk.conflicts;
    const blocked = risk.status === "blocked";
    if (blocked && !body.conflictOverride) {
      return NextResponse.json(
        {
          error: "Posible conflicto de interés detectado",
          ...risk,
        },
        { status: 409 }
      );
    }

    if (blocked && body.conflictOverride && !body.conflictNotes?.trim()) return jsonError("Debe registrar el fundamento de la autorización", 400);
    return await prisma.$transaction(async (tx) => {
      const causa = await tx.causa.create({
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
          pjudOrigin: "manual",
          clienteId: body.clienteId || null,
          abogadoId,
          conflictCheckedAt: new Date(),
          conflictStatus: risk.status,
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

      await tx.activity.create({
        data: {
          tipo: "estado",
          mensaje: `Nueva causa creada: ${causa.titulo}`,
          causaId: causa.id,
          userId: user.id,
        },
      });
      await ensureResponsableMiembro(causa.id, abogadoId, user.id, tx);

      await writeAuditStrict({
        actorId: user.id,
        action: body.conflictOverride && blocked
          ? "causa.create.conflict_override"
          : "causa.create",
        entityType: "Causa",
        entityId: causa.id,
        after: {
          titulo: causa.titulo,
          rit: causa.rit,
          conflicts,
          conflictOverride: Boolean(body.conflictOverride && blocked),
          conflictNotes: body.conflictNotes || null,
        },
      }, tx);

      return NextResponse.json({ ...causa, ...risk }, { status: 201 });
    }, { isolationLevel: "Serializable" });
  } catch (e) {
    return handleRouteError(e);
  }
}
