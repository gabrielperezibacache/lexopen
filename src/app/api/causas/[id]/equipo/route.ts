import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { writeAuditStrict } from "@/lib/audit";
import { publicUserSelect } from "@/lib/auth/public-user";
import {
  assertCausaAccess,
  assertCausaTeamManage,
  CAUSA_MIEMBRO_ROLES,
  ensureResponsableMiembro,
} from "@/lib/auth/causa-access";
import { can } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";

type Params = { params: Promise<{ id: string }> };

const memberSchema = z.object({
  userId: z.string().min(1),
  rol: z.enum(CAUSA_MIEMBRO_ROLES).default("colaborador"),
});

const accesoSchema = z.object({
  acceso: z.enum(["estudio", "equipo"]),
});

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    await assertCausaAccess(id, user);

    const [causa, miembros] = await Promise.all([
      prisma.causa.findUnique({
        where: { id },
        select: { id: true, acceso: true, abogadoId: true },
      }),
      prisma.causaMiembro.findMany({
        where: { causaId: id },
        include: {
          user: { select: publicUserSelect },
          agregadoPor: { select: { id: true, name: true } },
        },
        orderBy: [{ rol: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    return NextResponse.json({
      causa,
      miembros,
      canManage: can(user, "causa.team.manage", {
        causaRol:
          miembros.find((m) => m.userId === user.id)?.rol ??
          (causa?.abogadoId === user.id ? "responsable" : null),
      }),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    await assertCausaTeamManage(id, user);
    const body = await parseBody(req, memberSchema);

    const target = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, role: true },
    });
    if (!target || (!isStaff(target.role) && target.role !== "externo")) {
      return NextResponse.json(
        { error: "El miembro debe ser staff o externo" },
        { status: 400 }
      );
    }

    const member = await prisma.causaMiembro.upsert({
      where: { causaId_userId: { causaId: id, userId: body.userId } },
      create: {
        causaId: id,
        userId: body.userId,
        rol: body.rol,
        agregadoPorId: user.id,
      },
      update: { rol: body.rol, hasta: null },
      include: { user: { select: publicUserSelect } },
    });

    if (body.rol === "responsable") {
      await prisma.causa.update({
        where: { id },
        data: { abogadoId: body.userId },
      });
    }

    await writeAuditStrict({
      actorId: user.id,
      action: "causa.equipo.add",
      entityType: "CausaMiembro",
      entityId: member.id,
      after: { causaId: id, userId: body.userId, rol: body.rol },
    });

    return NextResponse.json(member, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    await assertCausaTeamManage(id, user);
    const body = await parseBody(req, accesoSchema);

    const before = await prisma.causa.findUnique({
      where: { id },
      select: { acceso: true, abogadoId: true },
    });
    if (!before) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }

    const causa = await prisma.causa.update({
      where: { id },
      data: { acceso: body.acceso },
      select: { id: true, acceso: true, abogadoId: true },
    });

    if (causa.abogadoId) {
      await ensureResponsableMiembro(id, causa.abogadoId, user.id);
    }

    await writeAuditStrict({
      actorId: user.id,
      action: "causa.acceso.update",
      entityType: "Causa",
      entityId: id,
      before: { acceso: before.acceso },
      after: { acceso: causa.acceso },
    });

    return NextResponse.json(causa);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    await assertCausaTeamManage(id, user);
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId requerido" }, { status: 400 });
    }

    const member = await prisma.causaMiembro.findUnique({
      where: { causaId_userId: { causaId: id, userId } },
    });
    if (!member) {
      return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });
    }
    if (member.rol === "responsable") {
      return NextResponse.json(
        { error: "No se puede quitar al responsable; reasígnelo primero" },
        { status: 409 }
      );
    }

    await prisma.causaMiembro.delete({
      where: { causaId_userId: { causaId: id, userId } },
    });
    await writeAuditStrict({
      actorId: user.id,
      action: "causa.equipo.remove",
      entityType: "CausaMiembro",
      entityId: member.id,
      before: { causaId: id, userId, rol: member.rol },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
