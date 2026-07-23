import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json([]);
  const messages = await prisma.message.findMany({
    where: { OR: [{ receiverId: user.id }, { senderId: user.id }] },
    include: { sender: true, receiver: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });
  const body = await req.json();
  const msg = await prisma.message.create({
    data: {
      subject: body.subject || null,
      body: body.body,
      senderId: user.id,
      receiverId: body.receiverId,
    },
  });
  await prisma.notification.create({
    data: {
      userId: body.receiverId,
      title: "Nuevo mensaje",
      body: body.subject || body.body.slice(0, 80),
      href: "/mensajes",
    },
  });
  return NextResponse.json(msg, { status: 201 });
}
