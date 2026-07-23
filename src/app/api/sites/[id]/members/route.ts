import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const members = await prisma.siteMember.findMany({
    where: { siteId: id },
    include: { user: true },
  });
  return NextResponse.json(members);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const member = await prisma.siteMember.upsert({
    where: { siteId_userId: { siteId: id, userId: body.userId } },
    create: { siteId: id, userId: body.userId, role: body.role || "contributor" },
    update: { role: body.role || "contributor" },
    include: { user: true },
  });
  const actor = await getCurrentUser();
  await prisma.activity.create({
    data: {
      tipo: "sistema",
      mensaje: `${member.user.name} agregado al site (${member.role})`,
      siteId: id,
      userId: actor?.id,
    },
  });
  return NextResponse.json(member, { status: 201 });
}
