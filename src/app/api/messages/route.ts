import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireUser } from "@/lib/api";
import { isCliente, isStaff } from "@/lib/auth/rbac";
import { publicUserSelect } from "@/lib/auth/public-user";

async function clientHasPortalSite(userId: string) {
  return (
    (await prisma.site.count({
      where: {
        isClientVisible: true,
        members: { some: { userId } },
      },
    })) > 0
  );
}

async function canMessage(
  sender: { id: string; role: string },
  receiverId: string
): Promise<boolean> {
  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
    select: { id: true, role: true },
  });
  if (!receiver || receiver.id === sender.id) return false;
  if (isStaff(sender.role) && isStaff(receiver.role)) return true;
  if (isStaff(sender.role) && isCliente(receiver.role)) {
    return clientHasPortalSite(receiver.id);
  }
  if (isCliente(sender.role) && isStaff(receiver.role)) {
    return clientHasPortalSite(sender.id);
  }
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const directory = req.nextUrl.searchParams.get("directory") === "1";
    if (directory) {
      if (isCliente(user.role)) {
        if (!(await clientHasPortalSite(user.id))) {
          return NextResponse.json({ users: [] });
        }
        const staff = await prisma.user.findMany({
          where: { role: { in: ["admin", "abogado", "asistente"] } },
          select: publicUserSelect,
          orderBy: { name: "asc" },
        });
        return NextResponse.json({ users: staff });
      }
      const clients = await prisma.user.findMany({
        where: {
          role: "cliente",
          siteMemberships: {
            some: { site: { isClientVisible: true } },
          },
        },
        select: publicUserSelect,
        orderBy: { name: "asc" },
      });
      const staff = await prisma.user.findMany({
        where: {
          role: { in: ["admin", "abogado", "asistente"] },
          id: { not: user.id },
        },
        select: publicUserSelect,
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ users: [...staff, ...clients] });
    }

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
      return NextResponse.json(
        { error: "Destinatario y mensaje son obligatorios" },
        { status: 400 }
      );
    }
    if (!(await canMessage(user, body.receiverId))) {
      return NextResponse.json(
        { error: "No puede mensajear a este destinatario" },
        { status: 403 }
      );
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
