import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { httpError } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { isRole, STAFF_ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";

const feedbackId = z.string().cuid("El comentario no se pudo identificar.");
export const createFeedbackSchema = z.object({
  requestId: z.string().regex(/^[A-Za-z0-9._:-]{8,160}$/, "El envío no se pudo identificar."),
  category: z.enum(["sugerencia", "error", "otro"]),
  title: z.string().trim().min(1, "Escribe un título.").max(120, "El título admite hasta 120 caracteres.").refine(value => !/[\r\n\0]/.test(value), "El título debe estar en una sola línea."),
  details: z.string().trim().min(1, "Describe tu comentario.").max(3000, "La descripción admite hasta 3000 caracteres.").refine(value => !value.includes("\0"), "La descripción contiene un carácter inválido."),
}).strict();
export const updateFeedbackSchema = z.object({
  id: feedbackId,
  status: z.enum(["nuevo", "en_revision", "resuelto"]),
}).strict();

const authorSelect = { id: true, name: true } as const;
const feedbackSelect = { id: true, category: true, title: true, details: true, status: true, createdAt: true, updatedAt: true } as const;
const pageSize = 30;
type Author = Prisma.UserGetPayload<{ select: typeof authorSelect }>;
type FeedbackRow = Prisma.FeedbackGetPayload<{ select: typeof feedbackSelect }>;

function feedbackItem(row: FeedbackRow, author?: Author) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), ...(author ? { author } : {}) };
}

export type FeedbackItem = ReturnType<typeof feedbackItem>;

async function feedbackActor(user: { id: string }, tx: Prisma.TransactionClient) {
  const actor = await tx.user.findUnique({
    where: { id: user.id },
    select: { ...authorSelect, role: true, capabilityGrants: true, capabilityRevokes: true },
  });
  if (!actor || !isRole(actor.role) || !STAFF_ROLES.includes(actor.role)) throw httpError("El apartado de comentarios está reservado al equipo del estudio.", 403);
  return { author: { id: actor.id, name: actor.name }, canManage: can(actor, "host.admin") };
}

function parseCursor(before: string | null) {
  if (before === null) return null;
  const [stamp, id, extra] = before.length <= 100 ? before.split("~") : [];
  const createdAt = new Date(stamp || "");
  if (extra !== undefined || !feedbackId.safeParse(id).success || !Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== stamp) {
    throw httpError("No se pudo leer la posición de los comentarios.", 400);
  }
  return { createdAt, id };
}

export async function readFeedback(user: { id: string }, before: string | null = null, client: PrismaClient = prisma) {
  const cursor = parseCursor(before);
  return client.$transaction(async tx => {
    const { author, canManage } = await feedbackActor(user, tx);
    const rows = await tx.feedback.findMany({
      where: {
        ...(canManage ? {} : { ownerId: author.id }),
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      },
      select: { ...feedbackSelect, owner: { select: authorSelect } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
    });
    const page = rows.slice(0, pageSize);
    const oldest = page.at(-1);
    return {
      feedback: page.map(({ owner, ...row }) => feedbackItem(row, canManage ? owner : undefined)),
      canManage,
      nextCursor: rows.length > pageSize && oldest ? `${oldest.createdAt.toISOString()}~${oldest.id}` : null,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export type FeedbackPage = Awaited<ReturnType<typeof readFeedback>>;

export async function createFeedback(raw: unknown, user: { id: string }, client: PrismaClient = prisma) {
  const input = createFeedbackSchema.parse(raw);
  async function save(retry = false) {
    return client.$transaction(async tx => {
      const { author, canManage } = await feedbackActor(user, tx);
      const key = { ownerId_requestId: { ownerId: author.id, requestId: input.requestId } };
      const row = retry
        ? await tx.feedback.findUniqueOrThrow({ where: key, select: feedbackSelect })
        : await tx.feedback.upsert({ where: key, create: { ...input, ownerId: author.id }, update: {}, select: feedbackSelect });
      if (row.category !== input.category || row.title !== input.title || row.details !== input.details) {
        throw httpError("Este envío corresponde a otro comentario.", 409);
      }
      return feedbackItem(row, canManage ? author : undefined);
    });
  }
  try {
    return await save();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return save(true);
    throw error;
  }
}

export async function updateFeedback(raw: unknown, user: { id: string }, client: PrismaClient = prisma) {
  const { id, status } = updateFeedbackSchema.parse(raw);
  return client.$transaction(async tx => {
    const { canManage } = await feedbackActor(user, tx);
    if (!canManage) throw httpError("Sólo la administración del Host puede cambiar el estado de los comentarios.", 403);
    await tx.feedback.updateMany({ where: { id, status: { not: status } }, data: { status } });
    const record = await tx.feedback.findUnique({ where: { id }, select: { ...feedbackSelect, owner: { select: authorSelect } } });
    if (!record) throw httpError("No se encontró el comentario.", 404);
    const { owner, ...row } = record;
    return feedbackItem(row, owner);
  });
}
