import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { writeAuditStrict } from "@/lib/audit";
import { buildIcs } from "@/lib/calendario/ics";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { addCivilDays, isValidYmd, santiagoDateKey, SANTIAGO_TZ } from "@/lib/chile-time";
import { prisma } from "@/lib/db";
import { isValidHhmm, wallParts, zonedTime } from "@/lib/notify/time";
import { altazorActor, altazorTransaction } from "./access";
import { ACADEMIC_TEACHING_TEMPLATES } from "./academic-templates";
import { altazorRequestId } from "./schemas";
import { teachingReminderFields, teachingReminderLeadSchema } from "./teaching-reminder-policy";
import { readTeachingSessionContent, teachingSessionContentMutationSchema, type TeachingSessionContent } from "./teaching-session-content";

const sessionLimit = 200;
const deadlineRequestId = "academic-call-deadline";
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Elige una fecha y una hora de la Agenda.");
const activityFields = {
  title: z.string().trim().min(1, "Escribe un nombre para la actividad.").max(160),
  startsAtLocal: localDateTime,
  endsAtLocal: localDateTime.nullish(),
};
export const teachingSessionSchema = z.object({
  ...activityFields,
  requestId: altazorRequestId.refine(value => value !== deadlineRequestId),
  reminderLeadMinutes: teachingReminderLeadSchema.optional(),
}).strict();
const teachingSeriesSchema = teachingSessionSchema.extend({
  recurrence: z.object({
    intervalWeeks: z.union([z.literal(1), z.literal(2)]),
    count: z.number().int().min(2).max(24),
  }).strict(),
});
export const teachingSessionEditSchema = z.object({
  ...activityFields,
  expectedSequence: z.number().int().min(0).max(2_147_483_647),
}).strict();
export const teachingSessionDeleteScope = z.enum(["single", "following"]);
const callDeadlineSchema = z.object({
  action: z.literal("schedule-call-deadline"),
  date: z.string().refine(isValidYmd, "La fecha de cierre no es válida."),
  localDate: z.string().refine(isValidYmd, "Elige una fecha válida para la Agenda."),
  time: z.string().refine(isValidHhmm, "Elige una hora para el cierre."),
  reminderLeadMinutes: teachingReminderLeadSchema.optional(),
}).strict();
export const teachingSessionMutationSchema = z.union([teachingSessionSchema, teachingSeriesSchema, callDeadlineSchema]);

export type TeachingSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  startsAtLocal: string;
  endsAtLocal: string | null;
  calendarSequence: number;
  agendaHref: string;
  callDeadline?: true;
  series?: { id: string; occurrence: number; count: number; intervalWeeks: 1 | 2 };
  reminderLeadMinutes: number | null;
  contentRevision: number;
  content: TeachingSessionContent;
};

const calendarSessionSelect = { id: true, title: true, startsAt: true, endsAt: true } as const;
const sessionSelect = {
  ...calendarSessionSelect, requestId: true, calendarSequence: true, updatedAt: true,
  reminderLeadMinutes: true, seriesOccurrence: true, series: { select: { id: true, count: true, intervalWeeks: true } },
  contentRevision: true, contentJson: true,
} as const;
type Session = Prisma.AltazorTeachingSessionGetPayload<{ select: typeof sessionSelect }>;
const ownedTeachingWork = (ownerId: string) => ({ ownerId, kind: { in: [...ACADEMIC_TEACHING_TEMPLATES] }, archivedAt: null });
const missing = () => httpError("La actividad o el trabajo docente no están disponibles.", 404);
const requestConflict = () => httpError("Este intento ya corresponde a otra actividad. Revisa los datos y vuelve a intentarlo.", 409);
const editConflict = () => httpError("La actividad cambió. Vuelve a cargarla antes de guardar.", 409);

export function teachingTime(value: string, offsetDays = 0) {
  const [day, time] = value.split("T");
  if (!isValidYmd(day) || !isValidHhmm(time)) throw httpError("Elige una fecha y una hora válidas.", 400);
  const actualDay = offsetDays ? addCivilDays(day, offsetDays) : day;
  if (!isValidYmd(actualDay)) throw httpError("Elige una fecha y una hora válidas.", 400);
  const instant = zonedTime(actualDay, time, SANTIAGO_TZ);
  if (localTeachingTime(instant) !== `${actualDay}T${time}`) {
    throw httpError(`La hora ${time} del ${actualDay} no existe en Santiago por el cambio de horario. Elige otra.`, 400);
  }
  return instant;
}

function localTeachingTime(date: Date) {
  const wall = wallParts(date, SANTIAGO_TZ);
  return `${wall.ymd}T${String(wall.hour).padStart(2, "0")}:${String(wall.minute).padStart(2, "0")}`;
}

function teachingDates(startsAtLocal: string, endsAtLocal?: string | null, offsetDays = 0) {
  const startsAt = teachingTime(startsAtLocal, offsetDays);
  const endsAt = endsAtLocal ? teachingTime(endsAtLocal, offsetDays) : null;
  if (endsAt && endsAt <= startsAt) throw httpError("La hora de término debe ser posterior al inicio.", 400);
  return { startsAt, endsAt };
}

function matchesActivity(row: Session, title: string, startsAt: Date, endsAt: Date | null) {
  return row.title === title && +row.startsAt === +startsAt && row.endsAt?.getTime() === endsAt?.getTime();
}

function view(row: Session): TeachingSession {
  const ym = santiagoDateKey(row.startsAt).slice(0, 7);
  return { id: row.id, title: row.title, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt?.toISOString() ?? null, agendaHref: `/calendario?vista=agenda&ym=${ym}&tipo=evento`,
    startsAtLocal: localTeachingTime(row.startsAt), endsAtLocal: row.endsAt ? localTeachingTime(row.endsAt) : null,
    calendarSequence: row.calendarSequence, reminderLeadMinutes: row.reminderLeadMinutes,
    contentRevision: row.contentRevision, content: readTeachingSessionContent(row.contentJson),
    ...(row.requestId === deadlineRequestId ? { callDeadline: true as const } : {}),
    ...(row.series && row.seriesOccurrence && { series: {
      id: row.series.id, occurrence: row.seriesOccurrence, count: row.series.count,
      intervalWeeks: row.series.intervalWeeks === 2 ? 2 as const : 1 as const,
    } }),
  };
}

async function teachingWorkspace(id: string, user: CausaAccessUser, client: Prisma.TransactionClient) {
  const actor = await altazorActor(user, client);
  if (!await client.altazorAcademicWorkspace.findFirst({ where: { id, ...ownedTeachingWork(actor.id) }, select: { id: true } })) throw missing();
  return actor;
}

async function readTeachingSessions<T extends Prisma.AltazorTeachingSessionSelect>(workspaceId: string, user: CausaAccessUser, client: PrismaClient, select: T) {
  const actor = await teachingWorkspace(workspaceId, user, client);
  return client.altazorTeachingSession.findMany({
    where: { workspaceId, workspace: ownedTeachingWork(actor.id) }, select,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: sessionLimit,
  });
}

export async function listTeachingSessions(workspaceId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const sessions = await readTeachingSessions(workspaceId, user, client, sessionSelect);
  return { sessions: sessions.map(view) };
}

export async function exportTeachingSessions(workspaceId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const sessions = await readTeachingSessions(workspaceId, user, client, calendarSessionSelect);
  return buildIcs(sessions.map(session => ({
    id: session.id, titulo: session.title, inicio: session.startsAt, fin: session.endsAt,
  })));
}

export async function createTeachingSession(workspaceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const { requestId, title, startsAtLocal, endsAtLocal, reminderLeadMinutes = null } = teachingSessionSchema.parse(raw);
  const { startsAt, endsAt } = teachingDates(startsAtLocal, endsAtLocal);
  const requestPayloadSha256 = createHash("sha256").update(JSON.stringify([title, startsAtLocal, endsAtLocal ?? null, reminderLeadMinutes])).digest("hex");
  return altazorTransaction(client, async tx => {
    const actor = await teachingWorkspace(workspaceId, user, tx);
    const where = { workspaceId_requestId: { workspaceId, requestId } };
    const previous = await tx.altazorTeachingSession.findUnique({ where, select: { ...sessionSelect, requestPayloadSha256: true } });
    if (previous) {
      const matches = previous.requestPayloadSha256
        ? previous.requestPayloadSha256 === requestPayloadSha256
        : matchesActivity(previous, title, startsAt, endsAt) && (reminderLeadMinutes === null || previous.reminderLeadMinutes === reminderLeadMinutes);
      if (previous.series || !matches) throw requestConflict();
      return { session: view(previous), reused: true };
    }
    if (await tx.altazorTeachingSeries.findUnique({ where, select: { id: true } })) throw requestConflict();
    await assertCapacity(tx, workspaceId, 1);
    const created = await tx.altazorTeachingSession.create({
      data: { workspaceId, requestId, requestPayloadSha256, title, startsAt, endsAt, ...teachingReminderFields(startsAt, reminderLeadMinutes) },
      select: sessionSelect,
    });
    await writeAuditStrict({ actorId: actor.id, action: "altazor.teaching.schedule", entityType: "AltazorTeachingSession", entityId: created.id }, tx);
    return { session: view(created), reused: false };
  });
}

async function assertCapacity(tx: Prisma.TransactionClient, workspaceId: string, count: number) {
  if (await tx.altazorTeachingSession.count({ where: { workspaceId } }) + count > sessionLimit) {
    throw httpError("Este trabajo alcanzó el límite de doscientas actividades.", 413);
  }
}

export async function createTeachingSeries(workspaceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const { requestId, title, startsAtLocal, endsAtLocal, reminderLeadMinutes = null, recurrence } = teachingSeriesSchema.parse(raw);
  const { intervalWeeks, count } = recurrence;
  const inputSha256 = createHash("sha256").update(JSON.stringify([title, startsAtLocal, endsAtLocal ?? null, reminderLeadMinutes, intervalWeeks, count])).digest("hex");
  return altazorTransaction(client, async tx => {
    const actor = await teachingWorkspace(workspaceId, user, tx);
    const where = { workspaceId_requestId: { workspaceId, requestId } };
    const previous = await tx.altazorTeachingSeries.findUnique({ where, select: { id: true, inputSha256: true } });
    if (previous && previous.inputSha256 !== inputSha256) throw requestConflict();
    if (!previous && await tx.altazorTeachingSession.findUnique({ where, select: { id: true } })) throw requestConflict();
    const series = previous ?? await tx.altazorTeachingSeries.create({
      data: { workspaceId, requestId, inputSha256, intervalWeeks, count }, select: { id: true, inputSha256: true },
    });
    if (!previous) {
      await assertCapacity(tx, workspaceId, count);
      await tx.altazorTeachingSession.createMany({
        data: Array.from({ length: count }, (_, index) => {
          const dates = teachingDates(startsAtLocal, endsAtLocal, index * intervalWeeks * 7);
          return {
            workspaceId, title, requestId: randomUUID(), seriesId: series.id, seriesOccurrence: index + 1,
            ...dates, ...teachingReminderFields(dates.startsAt, reminderLeadMinutes),
          };
        }),
      });
      await writeAuditStrict({ actorId: actor.id, action: "altazor.teaching.series-create", entityType: "AltazorTeachingSeries", entityId: series.id }, tx);
    }
    const rows = await tx.altazorTeachingSession.findMany({
      where: { workspaceId, seriesId: series.id }, select: sessionSelect, orderBy: { seriesOccurrence: "asc" },
    });
    const sessions = rows.map(view);
    return { session: sessions[0] ?? null, sessions, reused: Boolean(previous) };
  });
}

export async function editTeachingSession(workspaceId: string, id: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const { title, startsAtLocal, endsAtLocal, expectedSequence } = teachingSessionEditSchema.parse(raw);
  const { startsAt, endsAt } = teachingDates(startsAtLocal, endsAtLocal);
  return altazorTransaction(client, async tx => {
    const actor = await teachingWorkspace(workspaceId, user, tx);
    const current = await tx.altazorTeachingSession.findFirst({ where: { id, workspaceId }, select: sessionSelect });
    if (!current) throw missing();
    if (current.requestId === deadlineRequestId) throw httpError("Actualiza esta fecha de cierre desde su convocatoria.", 409);
    if (current.calendarSequence !== expectedSequence) throw editConflict();
    if (matchesActivity(current, title, startsAt, endsAt)) return { session: view(current) };
    const saved = await tx.altazorTeachingSession.update({
      where: { id, workspaceId, calendarSequence: expectedSequence },
      data: {
        title, startsAt, endsAt, calendarSequence: { increment: 1 },
        ...(+current.startsAt !== +startsAt ? teachingReminderFields(startsAt, current.reminderLeadMinutes) : {}),
      },
      select: sessionSelect,
    });
    await writeAuditStrict({ actorId: actor.id, action: "altazor.teaching.edit", entityType: "AltazorTeachingSession", entityId: saved.id }, tx);
    return { session: view(saved) };
  });
}

export async function updateTeachingSessionContent(workspaceId: string, id: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const { expectedRevision, content } = teachingSessionContentMutationSchema.parse(raw);
  const contentJson = JSON.stringify(content);
  return altazorTransaction(client, async tx => {
    const actor = await teachingWorkspace(workspaceId, user, tx);
    const where = { id, workspaceId };
    const current = await tx.altazorTeachingSession.findFirst({
      where, select: { contentRevision: true, contentJson: true, updatedAt: true, requestId: true },
    });
    if (!current) throw missing();
    if (current.requestId === deadlineRequestId) throw httpError("El cierre de una convocatoria no admite contenido de una sesión.", 409);
    if (current.contentRevision !== expectedRevision) throw httpError("El contenido de la sesión cambió. Vuelve a cargarlo antes de guardar.", 409);
    if (contentJson === JSON.stringify(readTeachingSessionContent(current.contentJson))) return { contentRevision: current.contentRevision, content };
    const saved = await tx.altazorTeachingSession.update({
      where: { ...where, contentRevision: expectedRevision },
      // This private content never changes the event revision exposed by the calendar.
      data: { contentJson, contentRevision: { increment: 1 }, updatedAt: current.updatedAt },
      select: { contentRevision: true },
    });
    await writeAuditStrict({ actorId: actor.id, action: "altazor.teaching.content-update", entityType: "AltazorTeachingSession", entityId: id }, tx);
    return { contentRevision: saved.contentRevision, content };
  });
}

export async function scheduleTeachingCallDeadline(workspaceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const { date, localDate, time, reminderLeadMinutes } = callDeadlineSchema.parse(raw);
  const startsAt = teachingTime(`${localDate}T${time}`);
  return altazorTransaction(client, async tx => {
    const actor = await altazorActor(user, tx);
    const workspace = await tx.altazorAcademicWorkspace.findFirst({
      where: { id: workspaceId, ownerId: actor.id, kind: "call", archivedAt: null },
      select: { title: true, briefJson: true },
    });
    if (!workspace) throw missing();
    if (JSON.parse(workspace.briefJson).call?.deadline !== date) {
      throw httpError("La fecha de cierre cambió. Guarda la ficha y revisa la fecha antes de agendar.", 409);
    }
    const title = `Cierre · ${workspace.title}`.slice(0, 160);
    const where = { workspaceId_requestId: { workspaceId, requestId: deadlineRequestId } };
    const previous = await tx.altazorTeachingSession.findUnique({ where, select: sessionSelect });
    const lead = reminderLeadMinutes === undefined ? previous?.reminderLeadMinutes ?? null : reminderLeadMinutes;
    const startsAtChanged = previous?.startsAt.getTime() !== startsAt.getTime();
    const calendarChanged = startsAtChanged || previous?.title !== title;
    const reminderChanged = lead !== previous?.reminderLeadMinutes;
    if (previous && !calendarChanged && !reminderChanged) return { session: view(previous), reused: true };
    if (!previous) await assertCapacity(tx, workspaceId, 1);
    const saved = await tx.altazorTeachingSession.upsert({
      where, create: { workspaceId, requestId: deadlineRequestId, title, startsAt, ...teachingReminderFields(startsAt, lead) },
      update: {
        title, startsAt,
        ...(calendarChanged ? { calendarSequence: { increment: 1 } } : { updatedAt: previous?.updatedAt }),
        ...(startsAtChanged || reminderChanged ? teachingReminderFields(startsAt, lead) : {}),
      },
      select: sessionSelect,
    });
    await writeAuditStrict({ actorId: actor.id, action: "altazor.teaching.call-deadline", entityType: "AltazorTeachingSession", entityId: saved.id }, tx);
    return { session: view(saved), reused: Boolean(previous) };
  });
}

export async function deleteTeachingSession(workspaceId: string, id: string, user: CausaAccessUser, client: PrismaClient = prisma,
  scope: z.infer<typeof teachingSessionDeleteScope> = "single",
) {
  return altazorTransaction(client, async tx => {
    const actor = await teachingWorkspace(workspaceId, user, tx);
    if (scope === "following") {
      const anchor = await tx.altazorTeachingSession.findFirst({ where: { id, workspaceId }, select: { seriesId: true, seriesOccurrence: true } });
      if (!anchor) throw missing();
      if (!anchor.seriesId || !anchor.seriesOccurrence) throw httpError("Esta actividad no pertenece a una serie.", 409);
      await tx.altazorTeachingSession.deleteMany({ where: {
        workspaceId, seriesId: anchor.seriesId, seriesOccurrence: { gte: anchor.seriesOccurrence },
      } });
      await writeAuditStrict({ actorId: actor.id, action: "altazor.teaching.series-remove-following", entityType: "AltazorTeachingSeries", entityId: anchor.seriesId }, tx);
    } else {
      if (!(await tx.altazorTeachingSession.deleteMany({ where: { id, workspaceId } })).count) throw missing();
      await writeAuditStrict({ actorId: actor.id, action: "altazor.teaching.remove", entityType: "AltazorTeachingSession", entityId: id }, tx);
    }
    return { deleted: true };
  });
}

/** The calendar displays only the current account's active teaching work. */
export async function teachingCalendarSessions(user: CausaAccessUser, range: { start: Date; end: Date }, client: PrismaClient = prisma) {
  if (!isStaff(user.role) || !canSome(user, "assistant.use")) return [];
  return client.altazorTeachingSession.findMany({
    where: { workspace: ownedTeachingWork(user.id), startsAt: { gte: range.start, lte: range.end } },
    select: { id: true, title: true, startsAt: true, endsAt: true, workspaceId: true }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 300,
  });
}
