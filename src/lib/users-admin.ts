import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { writeAuditStrict } from "@/lib/audit";
import { toPublicUser } from "@/lib/auth/public-user";

const ROLES = ["admin", "abogado", "asistente", "cliente"] as const;
export type UserRole = (typeof ROLES)[number];

export function isUserRole(value: string): value is UserRole {
  return (ROLES as readonly string[]).includes(value);
}

export function pickAvatarColor(name: string) {
  const palette = ["#1f6f78", "#c47a3a", "#2f5d50", "#6b4f3a", "#3d5a80", "#8b5e34"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i) * (i + 1)) % palette.length;
  }
  return palette[hash];
}

function httpError(message: string, status: number) {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

export async function assertCanChangeAdminRole(opts: {
  beforeRole: string;
  nextRole: string;
}) {
  if (opts.beforeRole !== "admin" || opts.nextRole === "admin") return;
  const adminCount = await prisma.user.count({ where: { role: "admin" } });
  if (adminCount <= 1) {
    throw httpError("No se puede degradar al único administrador", 409);
  }
}

export async function createStudioUser(opts: {
  actorId: string;
  name: string;
  email: string;
  role: UserRole;
  title?: string | null;
  password: string;
}) {
  const email = opts.email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw httpError("Ya existe un usuario con ese email", 409);

  const password = await hashPassword(opts.password);
  const user = await prisma.user.create({
    data: {
      name: opts.name.trim(),
      email,
      role: opts.role,
      title: opts.title || null,
      password,
      avatarColor: pickAvatarColor(opts.name),
    },
  });
  await writeAuditStrict({
    actorId: opts.actorId,
    action: "user.create",
    entityType: "User",
    entityId: user.id,
    after: { email: user.email, role: user.role, name: user.name },
  });
  return toPublicUser(user);
}

export async function updateStudioUser(opts: {
  actorId: string;
  userId: string;
  name?: string;
  email?: string;
  title?: string | null;
  role?: UserRole;
  password?: string;
}) {
  const before = await prisma.user.findUnique({ where: { id: opts.userId } });
  if (!before) throw httpError("Usuario no encontrado", 404);

  const data: {
    name?: string;
    email?: string;
    title?: string | null;
    role?: string;
    password?: string;
    sessionVersion?: { increment: number };
    avatarColor?: string;
  } = {};

  if (opts.name !== undefined) {
    data.name = opts.name.trim();
    data.avatarColor = pickAvatarColor(opts.name);
  }
  if (opts.email !== undefined) {
    const email = opts.email.trim().toLowerCase();
    if (email !== before.email) {
      const clash = await prisma.user.findUnique({ where: { email } });
      if (clash) throw httpError("Ya existe un usuario con ese email", 409);
    }
    data.email = email;
  }
  if (opts.title !== undefined) data.title = opts.title || null;
  if (opts.role !== undefined && opts.role !== before.role) {
    await assertCanChangeAdminRole({
      beforeRole: before.role,
      nextRole: opts.role,
    });
    data.role = opts.role;
    data.sessionVersion = { increment: 1 };
  }
  if (opts.password) {
    data.password = await hashPassword(opts.password);
    data.sessionVersion = data.sessionVersion || { increment: 1 };
  }

  const user = await prisma.user.update({
    where: { id: opts.userId },
    data,
  });

  await writeAuditStrict({
    actorId: opts.actorId,
    action: "user.update",
    entityType: "User",
    entityId: user.id,
    before: {
      email: before.email,
      role: before.role,
      name: before.name,
      title: before.title,
    },
    after: {
      email: user.email,
      role: user.role,
      name: user.name,
      title: user.title,
      passwordReset: Boolean(opts.password),
    },
  });

  return toPublicUser(user);
}

/**
 * Elimina un usuario del estudio con limpieza de referencias opcionales.
 * Bloquea si tiene horas registradas (TimeEntry.userId es obligatorio).
 */
export async function deleteStudioUser(opts: {
  actorId: string;
  userId: string;
}) {
  if (opts.actorId === opts.userId) {
    throw httpError("No puede eliminar su propio usuario", 409);
  }
  const before = await prisma.user.findUnique({ where: { id: opts.userId } });
  if (!before) throw httpError("Usuario no encontrado", 404);

  if (before.role === "admin") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) {
      throw httpError("No se puede eliminar al único administrador", 409);
    }
  }

  const timeEntries = await prisma.timeEntry.count({
    where: { userId: opts.userId },
  });
  if (timeEntries > 0) {
    throw httpError(
      `No se puede eliminar: tiene ${timeEntries} registro(s) de horas. Reasígnelos o elimínelos en Facturación primero.`,
      409
    );
  }

  const userId = opts.userId;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.causa.updateMany({
        where: { abogadoId: userId },
        data: { abogadoId: null },
      });
      await tx.plazo.updateMany({
        where: { responsableId: userId },
        data: { responsableId: null },
      });
      await tx.task.updateMany({
        where: { assigneeId: userId },
        data: { assigneeId: null },
      });
      await tx.task.updateMany({
        where: { creatorId: userId },
        data: { creatorId: null },
      });
      await tx.documento.updateMany({
        where: { autorId: userId },
        data: { autorId: null },
      });
      await tx.minuta.updateMany({
        where: { autorId: userId },
        data: { autorId: null },
      });
      await tx.minutaAccion.updateMany({
        where: { responsableId: userId },
        data: { responsableId: null },
      });
      await tx.activity.updateMany({
        where: { userId },
        data: { userId: null },
      });
      await tx.agentChat.updateMany({
        where: { userId },
        data: { userId: null },
      });
      await tx.message.deleteMany({
        where: { OR: [{ senderId: userId }, { receiverId: userId }] },
      });
      await tx.timeEntry.updateMany({
        where: { approverId: userId },
        data: { approverId: null },
      });
      await tx.expense.updateMany({
        where: { authorId: userId },
        data: { authorId: null },
      });
      await tx.invoice.updateMany({
        where: { authorId: userId },
        data: { authorId: null },
      });
      await tx.feeArrangement.updateMany({
        where: { ownerId: userId },
        data: { ownerId: null },
      });
      await tx.fileVersion.updateMany({
        where: { authorId: userId },
        data: { authorId: null },
      });
      await tx.qaPost.updateMany({
        where: { authorId: userId },
        data: { authorId: null },
      });
      await tx.wikiPage.updateMany({
        where: { authorId: userId },
        data: { authorId: null },
      });
      await tx.comment.updateMany({
        where: { authorId: userId },
        data: { authorId: null },
      });
      await tx.workflowInstance.updateMany({
        where: { actorId: userId },
        data: { actorId: null },
      });

      await tx.user.delete({ where: { id: userId } });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Foreign key") || msg.includes("constraint")) {
      throw httpError(
        "No se puede eliminar: el usuario aún tiene registros vinculados. Revise facturación, causas o auditoría.",
        409
      );
    }
    throw e;
  }

  await writeAuditStrict({
    actorId: opts.actorId,
    action: "user.delete",
    entityType: "User",
    entityId: userId,
    before: { email: before.email, role: before.role, name: before.name },
  });

  return { ok: true as const, id: userId };
}
