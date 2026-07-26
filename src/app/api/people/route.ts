import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { isAdmin } from "@/lib/auth/rbac";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";

const createUserSchema = z.object({
  action: z.literal("create-user"),
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["admin", "abogado", "asistente", "cliente"]),
  title: z.string().optional().nullable(),
  password: z.string().min(6).optional(),
});

const updateRoleSchema = z.object({
  action: z.literal("update-role"),
  userId: z.string().min(1),
  role: z.enum(["admin", "abogado", "asistente", "cliente"]),
});

const createGroupSchema = z.object({
  action: z.literal("create-group"),
  name: z.string().min(2),
  description: z.string().optional().nullable(),
  memberIds: z.array(z.string()).optional(),
});

export async function GET() {
  try {
    await requireStaff();
    const [users, groups] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          title: true,
          avatarColor: true,
          siteMemberships: { include: { site: { select: { id: true, name: true } } } },
          groupMembers: { include: { group: { select: { id: true, name: true } } } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.group.findMany({
        include: { members: { include: { user: { select: { id: true, name: true } } } } },
        orderBy: { name: "asc" },
      }),
    ]);
    return NextResponse.json({ users, groups });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const actor = await requireStaff();
    const body = await req.json();

    if (body.action === "create-user") {
      if (!isAdmin(actor.role)) {
        return NextResponse.json({ error: "Solo admin puede crear usuarios" }, { status: 403 });
      }
      const data = createUserSchema.parse(body);
      const email = data.email.trim().toLowerCase();
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) {
        return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 });
      }
      const password = await hashPassword(data.password || "lexopen");
      const user = await prisma.user.create({
        data: {
          name: data.name.trim(),
          email,
          role: data.role,
          title: data.title || null,
          password,
          avatarColor: pickColor(data.name),
        },
      });
      await writeAudit({
        actorId: actor.id,
        action: "user.create",
        entityType: "User",
        entityId: user.id,
        after: { email: user.email, role: user.role },
      });
      return NextResponse.json(user, { status: 201 });
    }

    if (body.action === "create-group") {
      const data = createGroupSchema.parse(body);
      const group = await prisma.group.create({
        data: {
          name: data.name.trim(),
          description: data.description || null,
          members: data.memberIds?.length
            ? { create: data.memberIds.map((userId) => ({ userId })) }
            : undefined,
        },
        include: { members: { include: { user: true } } },
      });
      await writeAudit({
        actorId: actor.id,
        action: "group.create",
        entityType: "Group",
        entityId: group.id,
        after: { name: group.name },
      });
      return NextResponse.json(group, { status: 201 });
    }

    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    assertCsrf(req);
    const actor = await requireStaff();
    if (!isAdmin(actor.role)) {
      return NextResponse.json({ error: "Solo admin puede cambiar roles" }, { status: 403 });
    }
    const data = updateRoleSchema.parse(await req.json());
    const before = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!before) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    const user = await prisma.user.update({
      where: { id: data.userId },
      data: { role: data.role },
    });
    await writeAudit({
      actorId: actor.id,
      action: "user.role_update",
      entityType: "User",
      entityId: user.id,
      before: { role: before.role },
      after: { role: user.role },
    });
    return NextResponse.json(user);
  } catch (e) {
    return handleRouteError(e);
  }
}

function pickColor(name: string) {
  const palette = ["#1f6f78", "#c47a3a", "#2f5d50", "#6b4f3a", "#3d5a80", "#8b5e34"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i) * (i + 1)) % palette.length;
  return palette[hash];
}
