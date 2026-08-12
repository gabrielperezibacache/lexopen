import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { isAdmin } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { publicUserSelect } from "@/lib/auth/public-user";
import {
  createStudioUser,
  deleteStudioUser,
  updateStudioUser,
} from "@/lib/users-admin";

const roleEnum = z.enum(["admin", "abogado", "asistente", "cliente"]);

const createUserSchema = z.object({
  action: z.literal("create-user"),
  name: z.string().min(2).max(200),
  email: z.string().email().max(320),
  role: roleEnum,
  title: z.string().max(200).optional().nullable(),
  password: z.string().min(12).max(256),
});

const updateUserSchema = z.object({
  action: z.literal("update-user"),
  userId: z.string().min(1),
  name: z.string().min(2).max(200).optional(),
  email: z.string().email().max(320).optional(),
  role: roleEnum.optional(),
  title: z.string().max(200).optional().nullable(),
  password: z.string().min(12).max(256).optional(),
});

const updateRoleSchema = z.object({
  action: z.literal("update-role"),
  userId: z.string().min(1),
  role: roleEnum,
});

const deleteUserSchema = z.object({
  action: z.literal("delete-user"),
  userId: z.string().min(1),
});

const createGroupSchema = z.object({
  action: z.literal("create-group"),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional().nullable(),
  memberIds: z.array(z.string()).optional(),
});

const updateGroupSchema = z.object({
  action: z.literal("update-group"),
  groupId: z.string().min(1),
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  memberIds: z.array(z.string()).optional(),
});

const deleteGroupSchema = z.object({
  action: z.literal("delete-group"),
  groupId: z.string().min(1),
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
          createdAt: true,
          siteMemberships: {
            include: { site: { select: { id: true, name: true } } },
          },
          groupMembers: {
            include: { group: { select: { id: true, name: true } } },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.group.findMany({
        include: {
          members: { include: { user: { select: { id: true, name: true } } } },
        },
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
        return NextResponse.json(
          { error: "Solo admin puede crear usuarios" },
          { status: 403 }
        );
      }
      const data = createUserSchema.parse(body);
      const user = await createStudioUser({
        actorId: actor.id,
        name: data.name,
        email: data.email,
        role: data.role,
        title: data.title,
        password: data.password,
      });
      return NextResponse.json(user, { status: 201 });
    }

    if (body.action === "delete-user") {
      if (!isAdmin(actor.role)) {
        return NextResponse.json(
          { error: "Solo admin puede eliminar usuarios" },
          { status: 403 }
        );
      }
      const data = deleteUserSchema.parse(body);
      const result = await deleteStudioUser({
        actorId: actor.id,
        userId: data.userId,
      });
      return NextResponse.json(result);
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
        include: {
          members: { include: { user: { select: publicUserSelect } } },
        },
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

    if (body.action === "update-group") {
      if (!isAdmin(actor.role)) {
        return NextResponse.json(
          { error: "Solo admin puede editar grupos" },
          { status: 403 }
        );
      }
      const data = updateGroupSchema.parse(body);
      const before = await prisma.group.findUnique({
        where: { id: data.groupId },
        include: { members: true },
      });
      if (!before) {
        return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
      }
      if (data.memberIds) {
        await prisma.groupMember.deleteMany({ where: { groupId: data.groupId } });
        if (data.memberIds.length) {
          await prisma.groupMember.createMany({
            data: data.memberIds.map((userId) => ({
              groupId: data.groupId,
              userId,
            })),
            skipDuplicates: true,
          });
        }
      }
      const group = await prisma.group.update({
        where: { id: data.groupId },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.description !== undefined
            ? { description: data.description || null }
            : {}),
        },
        include: {
          members: { include: { user: { select: publicUserSelect } } },
        },
      });
      await writeAudit({
        actorId: actor.id,
        action: "group.update",
        entityType: "Group",
        entityId: group.id,
        before: { name: before.name, members: before.members.length },
        after: {
          name: group.name,
          members: group.members.length,
        },
      });
      return NextResponse.json(group);
    }

    if (body.action === "delete-group") {
      if (!isAdmin(actor.role)) {
        return NextResponse.json(
          { error: "Solo admin puede eliminar grupos" },
          { status: 403 }
        );
      }
      const data = deleteGroupSchema.parse(body);
      const before = await prisma.group.findUnique({
        where: { id: data.groupId },
      });
      if (!before) {
        return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
      }
      await prisma.group.delete({ where: { id: data.groupId } });
      await writeAudit({
        actorId: actor.id,
        action: "group.delete",
        entityType: "Group",
        entityId: data.groupId,
        before: { name: before.name },
      });
      return NextResponse.json({ ok: true, id: data.groupId });
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
      return NextResponse.json(
        { error: "Solo admin puede administrar usuarios" },
        { status: 403 }
      );
    }
    const body = await req.json();

    if (body.action === "update-user") {
      const data = updateUserSchema.parse(body);
      const user = await updateStudioUser({
        actorId: actor.id,
        userId: data.userId,
        name: data.name,
        email: data.email,
        title: data.title,
        role: data.role,
        password: data.password,
      });
      return NextResponse.json(user);
    }

    if (body.action === "update-role") {
      const data = updateRoleSchema.parse(body);
      const user = await updateStudioUser({
        actorId: actor.id,
        userId: data.userId,
        role: data.role,
      });
      return NextResponse.json(user);
    }

    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  } catch (e) {
    return handleRouteError(e);
  }
}
