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
  isDelegableCapability,
  parseDelegacionAlcance,
} from "@/lib/auth/delegacion";
import { can } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { parseListLimit } from "@/lib/api/list-limit";

const createSchema = z.object({
  delegadoId: z.string().min(1),
  alcance: z.string().min(1).max(500),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional().nullable(),
  motivo: z.string().max(1000).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const mine = req.nextUrl.searchParams.get("mine") !== "0";
    const limit = parseListLimit(req.nextUrl.searchParams.get("limit"), {
      default: 100,
      max: 300,
    });

    const rows = await prisma.delegacion.findMany({
      where: mine
        ? {
            OR: [{ delegadorId: user.id }, { delegadoId: user.id }],
          }
        : can(user, "host.admin")
          ? {}
          : { OR: [{ delegadorId: user.id }, { delegadoId: user.id }] },
      include: {
        delegador: { select: publicUserSelect },
        delegado: { select: publicUserSelect },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return NextResponse.json(rows);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, createSchema);

    if (body.delegadoId === user.id) {
      return NextResponse.json(
        { error: "No puede delegarse a sí mismo" },
        { status: 400 }
      );
    }

    const caps = parseDelegacionAlcance(body.alcance);
    if (!caps.length || body.alcance.split(",").some((c) => {
      const t = c.trim();
      return t && !isDelegableCapability(t);
    })) {
      return NextResponse.json(
        {
          error:
            "Alcance inválido. Use capacidades delegables: evento.manage, task.assign, notify.channels.self",
        },
        { status: 400 }
      );
    }

    const delegado = await prisma.user.findUnique({
      where: { id: body.delegadoId },
      select: { id: true, role: true },
    });
    if (!delegado || !isStaff(delegado.role)) {
      return NextResponse.json(
        { error: "El delegado debe ser un usuario del estudio" },
        { status: 400 }
      );
    }

    const row = await prisma.delegacion.create({
      data: {
        delegadorId: user.id,
        delegadoId: body.delegadoId,
        alcance: caps.join(","),
        desde: body.desde ? new Date(body.desde) : new Date(),
        hasta: body.hasta ? new Date(body.hasta) : null,
        motivo: body.motivo ?? null,
        activa: true,
      },
      include: {
        delegador: { select: publicUserSelect },
        delegado: { select: publicUserSelect },
      },
    });

    await writeAuditStrict({
      actorId: user.id,
      action: "delegacion.create",
      entityType: "Delegacion",
      entityId: row.id,
      after: {
        delegadoId: row.delegadoId,
        alcance: row.alcance,
        hasta: row.hasta,
      },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    const existing = await prisma.delegacion.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }
    if (existing.delegadorId !== user.id && !can(user, "host.admin")) {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    }

    const row = await prisma.delegacion.update({
      where: { id },
      data: {
        ...(body.activa !== undefined ? { activa: Boolean(body.activa) } : {}),
        ...(body.hasta !== undefined
          ? { hasta: body.hasta ? new Date(body.hasta) : null }
          : {}),
        ...(body.motivo !== undefined ? { motivo: body.motivo || null } : {}),
      },
      include: {
        delegador: { select: publicUserSelect },
        delegado: { select: publicUserSelect },
      },
    });

    await writeAuditStrict({
      actorId: user.id,
      action: "delegacion.update",
      entityType: "Delegacion",
      entityId: row.id,
      after: { activa: row.activa, hasta: row.hasta },
    });

    return NextResponse.json(row);
  } catch (e) {
    return handleRouteError(e);
  }
}
