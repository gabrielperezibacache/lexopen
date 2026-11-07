import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { isValidYmd, santiagoDateKey, SANTIAGO_TZ } from "@/lib/chile-time";
import { prisma } from "@/lib/db";
import { isValidHhmm, wallParts, zonedTime } from "@/lib/notify/time";
import { altazorActor, altazorTransaction } from "./access";
import { ACADEMIC_TEACHING_TEMPLATES } from "./academic-templates";
import { altazorRequestId } from "./schemas";

const sessionLimit = 200;
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Elige una fecha y una hora de la Agenda.");
export const teachingSessionSchema = z.object({
  requestId: altazorRequestId,
  title: z.string().trim().min(1, "Escribe un nombre para la actividad.").max(160),
  startsAtLocal: localDateTime,
  endsAtLocal: localDateTime.optional(),
}).strict();

export type TeachingSession = { id: string; title: string; startsAt: string; endsAt: string | null; agendaHref: string };

const sessionSelect = { id: true, title: true, startsAt: true, endsAt: true } as const;
type Session = Prisma.AltazorTeachingSessionGetPayload<{ select: typeof sessionSelect }>;
const ownedTeachingWork = (ownerId: string) => ({ ownerId, kind: { in: [...ACADEMIC_TEACHING_TEMPLATES] }, archivedAt: null });
const missing = () => httpError("La actividad o el trabajo docente no están disponibles.", 404);

function teachingTime(value: string) {
  const [day, time] = value.split("T");
  if (!isValidYmd(day) || !isValidHhmm(time)) throw httpError("Elige una fecha y una hora válidas.", 400);
  const instant = zonedTime(day, time, SANTIAGO_TZ), wall = wallParts(instant, SANTIAGO_TZ);
  if (wall.ymd !== day || `${String(wall.hour).padStart(2, "0")}:${String(wall.minute).padStart(2, "0")}` !== time) {
    throw httpError("Esa hora no existe en Santiago por el cambio de horario. Elige otra.", 400);
  }
  return instant;
}

function view(row: Session): TeachingSession {
  const ym = santiagoDateKey(row.startsAt).slice(0, 7);
  return { id: row.id, title: row.title, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt?.toISOString() ?? null, agendaHref: `/calendario?vista=agenda&ym=${ym}&tipo=evento` };
}

async function teachingWorkspace(id: string, user: CausaAccessUser, client: Prisma.TransactionClient) {
  const actor = await altazorActor(user, client);
  if (!await client.altazorAcademicWorkspace.findFirst({ where: { id, ...ownedTeachingWork(actor.id) }, select: { id: true } })) throw missing();
  return actor;
}

export async function listTeachingSessions(workspaceId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const actor = await teachingWorkspace(workspaceId, user, client);
  const sessions = await client.altazorTeachingSession.findMany({
    where: { workspaceId, workspace: ownedTeachingWork(actor.id) }, select: sessionSelect,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: sessionLimit,
  });
  return { sessions: sessions.map(view) };
}

export async function createTeachingSession(workspaceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const { requestId, title, startsAtLocal, endsAtLocal } = teachingSessionSchema.parse(raw);
  const startsAt = teachingTime(startsAtLocal), endsAt = endsAtLocal ? teachingTime(endsAtLocal) : null;
  if (endsAt && endsAt <= startsAt) throw httpError("La hora de término debe ser posterior al inicio.", 400);
  return altazorTransaction(client, async tx => {
    const actor = await teachingWorkspace(workspaceId, user, tx);
    const where = { workspaceId_requestId: { workspaceId, requestId } };
    const previous = await tx.altazorTeachingSession.findUnique({ where, select: sessionSelect });
    if (previous) {
      if (previous.title !== title || +previous.startsAt !== +startsAt || previous.endsAt?.getTime() !== endsAt?.getTime()) {
        throw httpError("Este intento ya corresponde a otra actividad. Revisa los datos y vuelve a intentarlo.", 409);
      }
      return { session: view(previous), reused: true };
    }
    if (await tx.altazorTeachingSession.count({ where: { workspaceId } }) >= sessionLimit) throw httpError("Este trabajo alcanzó el límite de doscientas actividades.", 413);
    const created = await tx.altazorTeachingSession.create({ data: { workspaceId, requestId, title, startsAt, endsAt }, select: sessionSelect });
    await writeAuditStrict({ actorId: actor.id, action: "altazor.teaching.schedule", entityType: "AltazorTeachingSession", entityId: created.id }, tx);
    return { session: view(created), reused: false };
  });
}

export async function deleteTeachingSession(workspaceId: string, id: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  return altazorTransaction(client, async tx => {
    const actor = await teachingWorkspace(workspaceId, user, tx);
    if (!(await tx.altazorTeachingSession.deleteMany({ where: { id, workspaceId } })).count) throw missing();
    await writeAuditStrict({ actorId: actor.id, action: "altazor.teaching.remove", entityType: "AltazorTeachingSession", entityId: id }, tx);
    return { deleted: true };
  });
}

/** The calendar displays only the current account's active teaching work. */
export async function teachingCalendarSessions(user: CausaAccessUser, range: { start: Date; end: Date }, client: PrismaClient = prisma) {
  if (!isStaff(user.role) || !canSome(user, "assistant.use")) return [];
  return client.altazorTeachingSession.findMany({
    where: { workspace: ownedTeachingWork(user.id), startsAt: { gte: range.start, lte: range.end } },
    select: { ...sessionSelect, workspaceId: true }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 300,
  });
}
