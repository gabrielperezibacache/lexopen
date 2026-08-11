import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireUser } from "@/lib/api";
import { publicUserSelect } from "@/lib/auth/public-user";

export async function GET() {
  try {
    const user = await requireUser();
    const messages = await prisma.message.findMany({
      where: { OR: [{ receiverId: user.id }, { senderId: user.id }] },
      include: {
        sender: { select: publicUserSelect },
        receiver: { select: publicUserSelect },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json(messages);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireUser();
    const body = await req.json();
    if (
      typeof body.receiverId !== "string" ||
      !body.receiverId ||
      typeof body.body !== "string" ||
      !body.body.trim() ||
      body.body.length > 10000
    ) {
      return NextResponse.json({ error: "Destinatario y mensaje son obligatorios" }, { status: 400 });
    }
    const receiver = await prisma.user.findUnique({
      where: { id: body.receiverId },
      select: { id: true },
    });
    if (!receiver) {
      return NextResponse.json({ error: "Destinatario no encontrado" }, { status: 404 });
    }
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
  } catch (e) {
    return handleRouteError(e);
  }
}
