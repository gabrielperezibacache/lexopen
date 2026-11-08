import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { writeAuditStrict } from "@/lib/audit";
import { toPublicUser } from "@/lib/auth/public-user";
import {
  CAPABILITIES,
  capabilityLevel,
  isCapability,
  serializeCapabilityCsv,
} from "@/lib/auth/permissions";
import { isAdmin } from "@/lib/auth/rbac";
import { ROLES, type Role } from "@/lib/auth/roles";
import { Prisma } from "@prisma/client";

export type UserRole = Role;

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

/** All administrative user changes share one serializable boundary, including audit. */
async function userTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 }); }
    catch (error) {
      if ((error as { code?: string }).code !== "P2034" || attempt >= 3) throw error;
    }
  }
}

function normalizeOverrides(raw: string | null | undefined) {
  const values = (raw || "").split(",").map(value => value.trim()).filter(Boolean);
  if (values.some(value => !isCapability(value))) throw httpError("Hay capacidades desconocidas. Seleccione permisos del catálogo.", 400);
  return serializeCapabilityCsv(values);
}

async function administrativeActor(tx: Prisma.TransactionClient, actorId: string) {
  const actor = await tx.user.findUnique({ where: { id: actorId } });
  if (!actor || !isAdmin(actor)) throw httpError("Prohibido: se requiere administrar el Host", 403);
  return actor;
}

/** Role names alone cannot protect a Host: grants and revokes also determine access. */
async function preserveHostAdministrator(tx: Prisma.TransactionClient, userId: string, next?: { role: string; capabilityGrants: string; capabilityRevokes: string }) {
  const users = await tx.user.findMany({ select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
  if (!users.some(user => user.id === userId ? next && isAdmin(next) : isAdmin(user))) {
    throw httpError("Debe conservar al menos un usuario interno con permiso para administrar el Host", 409);
  }
}

export function assertNoSelfEscalation(before: { role: string; capabilityGrants?: string | null; capabilityRevokes?: string | null }, next: typeof before) {
  const order = { none: 0, scoped: 1, all: 2 };
  if (CAPABILITIES.some(capability => order[capabilityLevel(next, capability)] > order[capabilityLevel(before, capability)])) {
    throw httpError("No puede ampliar sus propios permisos. Otro administrador del Host debe autorizar el cambio", 403);
  }
}

export async function createStudioUser(opts: {
  actorId: string;
  name: string;
  email: string;
  role: UserRole;
  title?: string | null;
  password: string;
  capabilityGrants?: string | null;
  capabilityRevokes?: string | null;
}) {
  const email = opts.email.trim().toLowerCase();
  // Founder grants belong only to setup/seed and existing accounts, never every new admin.
  const grants = normalizeOverrides(opts.capabilityGrants);
  const revokes = normalizeOverrides(opts.capabilityRevokes);
  const password = await hashPassword(opts.password);
  return userTransaction(async tx => {
    await administrativeActor(tx, opts.actorId);
    const exists = await tx.user.findUnique({ where: { email } });
    if (exists) throw httpError("Ya existe un usuario con ese email", 409);
    const user = await tx.user.create({
      data: {
        name: opts.name.trim(),
        email,
        role: opts.role,
        title: opts.title || null,
        password,
        avatarColor: pickAvatarColor(opts.name),
        capabilityGrants: grants,
        capabilityRevokes: revokes,
      },
    });
    await writeAuditStrict({
      actorId: opts.actorId,
      action: "user.create",
      entityType: "User",
      entityId: user.id,
      after: {
        email: user.email,
        role: user.role,
        name: user.name,
        capabilityGrants: user.capabilityGrants,
        capabilityRevokes: user.capabilityRevokes,
      },
    }, tx);
    return toPublicUser(user);
  });
}

export async function updateStudioUser(opts: {
  actorId: string;
  userId: string;
  name?: string;
  email?: string;
  title?: string | null;
  role?: UserRole;
  password?: string;
  capabilityGrants?: string | null;
  capabilityRevokes?: string | null;
}) {
  const password = opts.password ? await hashPassword(opts.password) : undefined;
  return userTransaction(async tx => {
    await administrativeActor(tx, opts.actorId);
    const before = await tx.user.findUnique({ where: { id: opts.userId } });
    if (!before) throw httpError("Usuario no encontrado", 404);

    const data: {
      name?: string;
      email?: string;
      title?: string | null;
      role?: string;
      password?: string;
      sessionVersion?: { increment: number };
      avatarColor?: string;
      capabilityGrants?: string;
      capabilityRevokes?: string;
    } = {};

    if (opts.name !== undefined) {
      data.name = opts.name.trim();
      data.avatarColor = pickAvatarColor(opts.name);
    }
    if (opts.email !== undefined) {
      const email = opts.email.trim().toLowerCase();
      if (email !== before.email) {
        const clash = await tx.user.findUnique({ where: { email } });
        if (clash) throw httpError("Ya existe un usuario con ese email", 409);
        data.email = email;
        data.sessionVersion = { increment: 1 };
      }
    }
    if (opts.title !== undefined) data.title = opts.title || null;
    if (opts.role !== undefined && opts.role !== before.role) {
      data.role = opts.role;
      data.sessionVersion = { increment: 1 };
    }
    if (password) {
      data.password = password;
      data.sessionVersion = data.sessionVersion || { increment: 1 };
    }
    if (opts.capabilityGrants !== undefined) {
      const grants = normalizeOverrides(opts.capabilityGrants);
      if (grants !== before.capabilityGrants) {
        data.capabilityGrants = grants;
        data.sessionVersion = data.sessionVersion || { increment: 1 };
      }
    }
    if (opts.capabilityRevokes !== undefined) {
      const revokes = normalizeOverrides(opts.capabilityRevokes);
      if (revokes !== before.capabilityRevokes) {
        data.capabilityRevokes = revokes;
        data.sessionVersion = data.sessionVersion || { increment: 1 };
      }
    }

    if (data.role !== undefined || data.capabilityGrants !== undefined || data.capabilityRevokes !== undefined) {
      const next = { role: data.role ?? before.role, capabilityGrants: data.capabilityGrants ?? before.capabilityGrants, capabilityRevokes: data.capabilityRevokes ?? before.capabilityRevokes };
      if (opts.actorId === opts.userId) assertNoSelfEscalation(before, next);
      await preserveHostAdministrator(tx, opts.userId, next);
    }

    const user = await tx.user.update({
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
        capabilityGrants: before.capabilityGrants,
        capabilityRevokes: before.capabilityRevokes,
      },
      after: {
        email: user.email,
        role: user.role,
        name: user.name,
        title: user.title,
        passwordReset: Boolean(opts.password),
        capabilityGrants: user.capabilityGrants,
        capabilityRevokes: user.capabilityRevokes,
      },
    }, tx);

    return toPublicUser(user);
  });
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
  return userTransaction(async tx => {
    await administrativeActor(tx, opts.actorId);
    const before = await tx.user.findUnique({ where: { id: opts.userId } });
    if (!before) throw httpError("Usuario no encontrado", 404);

    await preserveHostAdministrator(tx, opts.userId);

    const timeEntries = await tx.timeEntry.count({
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
    }, tx);

    return { ok: true as const, id: userId };
  });
}
