import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  requireSiteAccess,
  requireStaff,
  requireUser,
} from "@/lib/api";
import { isAdmin, isCliente } from "@/lib/auth/rbac";
import { publicUserSelect } from "@/lib/auth/public-user";

type Params = { params: Promise<{ id: string }> };

const siteMemberRoleSchema = z.enum([
  "admin",
  "contributor",
  "viewer",
  "client",
]);

const upsertMemberSchema = z.object({
  userId: z.string().min(1).max(64),
  role: siteMemberRoleSchema.optional(),
});

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    if (isCliente(user.role)) {
      return NextResponse.json(
        { error: "Acceso restringido al portal cliente" },
        { status: 403 }
      );
    }
    const members = await prisma.siteMember.findMany({
      where: { siteId: id },
      include: { user: { select: publicUserSelect } },
    });
    return NextResponse.json(members);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const actor = await requireStaff();
    if (!isAdmin(actor.role)) {
      return NextResponse.json(
        { error: "Solo admin puede administrar miembros del site" },
        { status: 403 }
      );
    }
    const { id } = await params;
    await requireSiteAccess(id, actor);
    const body = upsertMemberSchema.parse(await req.json());
    const target = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    const role = body.role || "contributor";
    const member = await prisma.siteMember.upsert({
      where: { siteId_userId: { siteId: id, userId: body.userId } },
      create: { siteId: id, userId: body.userId, role },
      update: { role },
      include: { user: { select: publicUserSelect } },
    });
    await prisma.activity.create({
      data: {
        tipo: "sistema",
        mensaje: `${member.user.name} agregado al site (${member.role})`,
        siteId: id,
        userId: actor.id,
      },
    });
    return NextResponse.json(member, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
