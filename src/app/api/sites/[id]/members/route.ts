import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireSiteAccess, requireStaff, requireUser } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    const members = await prisma.siteMember.findMany({
      where: { siteId: id },
      include: { user: true },
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
    const { id } = await params;
    const body = await req.json();
    const member = await prisma.siteMember.upsert({
      where: { siteId_userId: { siteId: id, userId: body.userId } },
      create: { siteId: id, userId: body.userId, role: body.role || "contributor" },
      update: { role: body.role || "contributor" },
      include: { user: true },
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
