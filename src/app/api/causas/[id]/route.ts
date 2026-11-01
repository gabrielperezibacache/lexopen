import {
  assertCsrf,
  confidentialWhere,
  handleRouteError,
  minutaConfidentialWhere,
  parseBody,
  requireRole,
  requireStaff,
} from "@/lib/api";
import { writeAuditStrict } from "@/lib/audit";
import { assertCausaTeamManage, ensureResponsableMiembro, assertCausaCapability as mutateCausa, assertCausaAccess as readCausa, causaAccessWhere as scopedcausaAccessWhere, documentReadWhere as scopeddocumentReadWhere, plazoAccessWhere, requiredCausaWhere as scopedrequiredCausaWhere } from "@/lib/auth/causa-access";
import { publicUserSelect } from "@/lib/auth/public-user";
import { isStaff } from "@/lib/auth/rbac";
import {
  checkConflicts
} from "@/lib/conflict";
import { prisma } from "@/lib/db";
import { causaUpdateSchema } from "@/lib/schemas";
import { documentoListSelect } from "@/lib/sites/file-select";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    await readCausa(id, user);
    const causa = await prisma.causa.findFirst({
      where: { AND: [scopedcausaAccessWhere(user), { id }] },
      include: {
        cliente: true,
        abogado: { select: publicUserSelect },
        partes: true,
        documentos: {
          where: { AND: [scopeddocumentReadWhere(user), confidentialWhere(user)] },
          orderBy: { updatedAt: "desc" },
          select: documentoListSelect,
        },
        plazos: { where: plazoAccessWhere(user),  orderBy: { fechaLimite: "asc" } },
        notas: { orderBy: { updatedAt: "desc" } },
        minutas: {
          where: { AND: [scopedrequiredCausaWhere(user), minutaConfidentialWhere(user)] },
          include: {
            autor: { select: publicUserSelect },
            acciones: true,
          },
          orderBy: { fecha: "desc" },
          take: 20,
        },
        actividades: {
          include: { user: { select: publicUserSelect } },
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });
    if (!causa) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }
    return NextResponse.json(causa);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    await mutateCausa(id, user, "causa.write");
    const body = await parseBody(req, causaUpdateSchema);

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) data[key] = value;
    }

    if (typeof data.abogadoId === "string") {
      const assigned = await prisma.user.findUnique({
        where: { id: data.abogadoId },
        select: { id: true, role: true },
      });
      if (!assigned || !isStaff(assigned.role)) {
        return NextResponse.json(
          { error: "El responsable debe ser un usuario del estudio" },
          { status: 400 }
        );
      }
    }

    if (data.clienteId === "") data.clienteId = null;
    if (data.abogadoId === "") data.abogadoId = null;

    return await prisma.$transaction(async (tx) => {
      const prev = await tx.causa.findFirst({
        where: { AND: [scopedcausaAccessWhere(user), { id }] },
        include: { partes: true },
      });
      if (!prev) {
        return NextResponse.json({ error: "No encontrada" }, { status: 404 });
      }
      if ((data.abogadoId !== undefined && data.abogadoId !== prev.abogadoId) || (data.acceso !== undefined && data.acceso !== prev.acceso)) await assertCausaTeamManage(id, user, tx);
      const causa = await tx.causa.update({
        where: { id },
        data,
      });

      if (typeof data.abogadoId === "string" && data.abogadoId) {
        await ensureResponsableMiembro(id, data.abogadoId, user.id, tx);
      }

      // Re-check conflicts against current parties after any update.
      const risk = await checkConflicts({
        user,
        partes: prev.partes.map((p) => ({ nombre: p.nombre, rut: p.rut })),
        excludeCausaId: id,
      });
      const conflicts = risk.conflicts;
      const conflictStatus = risk.status;
      await tx.causa.update({
        where: { id },
        data: {
          conflictCheckedAt: new Date(),
          conflictStatus,
        },
      });

      if (body.estado || body.etapa) {
        await tx.activity.create({
          data: {
            tipo: "estado",
            mensaje: `Actualización: estado=${causa.estado}, etapa=${causa.etapa}`,
            causaId: causa.id,
            userId: user.id,
          },
        });
      }
      if (body.etapa && body.etapa !== prev.etapa) {
        await tx.etapaHistorial.create({
          data: { causaId: id, etapa: body.etapa, nota: "Cambio de etapa" },
        });
      }
      await writeAuditStrict({
        actorId: user.id,
        action: "causa.update",
        entityType: "Causa",
        entityId: id,
        before: prev,
        after: { ...data, conflictStatus, conflictHits: conflicts.length },
      }, tx);

      return NextResponse.json({ ...causa, conflictStatus, ...risk });
    }, { isolationLevel: "Serializable" });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    assertCsrf(_req);
    const user = await requireRole("admin");
    const { id } = await params;
    await mutateCausa(id, user, "causa.write");
    return await prisma.$transaction(async (tx) => {
      const prev = await tx.causa.findFirst({
        where: { AND: [scopedcausaAccessWhere(user), { id }] },
        select: { id: true, titulo: true, rit: true, site: { select: { id: true } }, _count: { select: { documentos: true, plazos: true, tramites: true, notas: true, minutas: true, feeArrangements: true, timeEntries: true, expenses: true, invoices: true, ledgerEntries: true, agentChats: true, movimientos: true, mailboxMessages: true, eventos: true, tasks: true, researchRuns: true } } },
      });
      if (!prev) {
        return NextResponse.json({ error: "No encontrada" }, { status: 404 });
      }
      if (prev.site || Object.values(prev._count).some((count) => count > 0)) return NextResponse.json({ error: "La causa conserva documentos o registros vinculados. Archívela para mantener su historial y sus permisos." }, { status: 409 });
      await tx.causa.delete({ where: { id } });
      await writeAuditStrict({
        actorId: user.id,
        action: "causa.delete",
        entityType: "Causa",
        entityId: id,
        before: prev,
      }, tx);
      return NextResponse.json({ ok: true });
    }, { isolationLevel: "Serializable" });
  } catch (e) {
    return handleRouteError(e);
  }
}
