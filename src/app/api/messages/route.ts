import { assertCsrf, handleRouteError, requireUser } from "@/lib/api";
import { siteAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { can, canSome } from "@/lib/auth/permissions";
import { publicUserSelect, toPublicUser } from "@/lib/auth/public-user";
import { isCliente, isStaff } from "@/lib/auth/rbac";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { emitNotification } from "@/lib/notify/emit";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

function messageSites(user: CausaAccessUser): Prisma.SiteWhereInput {
  if (can(user, "client.message")) return siteAccessWhere(user);
  if (!canSome(user, "client.message")) return { id: "__none__" };
  return { AND: [siteAccessWhere(user), { causa: { OR: [{ abogadoId: user.id }, { miembros: { some: { userId: user.id, desde: { lte: new Date() }, OR: [{ hasta: null }, { hasta: { gt: new Date() } }] } } }] } }] };
}

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
  sender: CausaAccessUser,
  receiverId: string
): Promise<boolean> {
  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
  });
  if (!receiver || receiver.id === sender.id) return false;
  if (isStaff(sender.role) && isStaff(receiver.role)) return true;
  if (isStaff(sender.role) && isCliente(receiver.role)) {
    return canSome(sender, "client.message") && (await prisma.site.count({ where: { AND: [messageSites(sender), { isClientVisible: true, members: { some: { userId: receiver.id } } }] } })) > 0;
  }
  if (isCliente(sender.role) && isStaff(receiver.role)) {
    return canSome(sender, "client.message") && canSome(receiver, "client.message") && clientHasPortalSite(sender.id);
  }
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const directory = req.nextUrl.searchParams.get("directory") === "1";
    if (directory) {
      if (isCliente(user.role)) {
        if (!canSome(user, "client.message") || !(await clientHasPortalSite(user.id))) {
          return NextResponse.json({ users: [] });
        }
        const staff = await prisma.user.findMany({
          where: { role: { in: [...STAFF_ROLES] } },
          select: { ...publicUserSelect, capabilityGrants: true, capabilityRevokes: true },
          orderBy: { name: "asc" },
        });
        return NextResponse.json({ users: staff.filter((person) => canSome(person, "client.message")).map(toPublicUser) });
      }
      const clients = await prisma.user.findMany({
        where: {
          role: "cliente",
          siteMemberships: {
            some: { site: { AND: [{ isClientVisible: true }, messageSites(user)] } },
          },
        },
        select: publicUserSelect,
        orderBy: { name: "asc" },
      });
      const staff = await prisma.user.findMany({
        where: {
          role: { in: [...STAFF_ROLES] },
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
    const body = z.object({ receiverId: z.string().min(1).max(100), subject: z.string().max(300).nullable().optional(), body: z.string().trim().min(1).max(10000) }).parse(await req.json());
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
    return await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        subject: body.subject || null,
        body: body.body,
        senderId: user.id,
        receiverId: body.receiverId,
      },
    });
    await emitNotification({
      tipo: "mensaje.interno",
      userId: body.receiverId,
      title: "Nuevo mensaje",
      body: body.subject || body.body.slice(0, 80),
      href: "/mensajes",
      entityType: "message",
      entityId: msg.id,
    }, tx);
    return NextResponse.json(msg, { status: 201 });
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
