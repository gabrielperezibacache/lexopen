import type { Prisma } from "@prisma/client";
import { minutaConfidentialWhere } from "@/lib/api";
import { ACADEMIC_TEACHING_TEMPLATES } from "@/lib/altazor/academic-templates";
import { teachingReminderKey } from "@/lib/altazor/teaching-reminder-policy";
import { canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { causaAccessWhere, documentReadWhere, plazoAccessWhere, taskAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";

export type NotificationSubject = {
  entityType?: string | null;
  entityId?: string | null;
  causaId?: string | null;
  href?: string | null;
  dedupeKey?: string | null;
};

export function notificationActor(userId: string, tx: Prisma.TransactionClient) {
  return tx.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true },
  });
}

/** Resolve each kind of original resource in one query per page. */
export async function visibleNotificationSubjects<T extends NotificationSubject>(user: CausaAccessUser, subjects: readonly T[], tx: Prisma.TransactionClient) {
  const candidates = subjects.map(subject => ({ subject, id: subject.entityId, type: subject.entityType?.toLowerCase() }));
  const idsFor = (type: string) => [...new Set(candidates.flatMap(item => item.type === type && item.id ? [item.id] : []))];
  const documento = idsFor("documento"), plazo = idsFor("plazo"), minuta = idsFor("minuta"), tramite = idsFor("tramite"), task = idsFor("task"), message = idsFor("message");
  const callSubscriptions = idsFor("altazorcallsubscription");
  const teachingReminders = idsFor("altazorteachingreminder");
  const academicNotices = isStaff(user.role) && canSome(user, "assistant.use");
  const fields = { id: true, causaId: true } as const;
  const [documents, deadlines, minutes, proceedings, tasks, messages, calls, reminders] = await Promise.all([
    documento.length ? tx.documento.findMany({ where: { AND: [{ id: { in: documento } }, documentReadWhere(user)] }, select: fields }) : [],
    plazo.length ? tx.plazo.findMany({ where: { AND: [{ id: { in: plazo } }, plazoAccessWhere(user)] }, select: fields }) : [],
    minuta.length ? tx.minuta.findMany({ where: { AND: [{ id: { in: minuta } }, minutaConfidentialWhere(user)] }, select: fields }) : [],
    tramite.length ? tx.tramite.findMany({ where: { id: { in: tramite } }, select: fields }) : [],
    task.length ? tx.task.findMany({ where: { AND: [{ id: { in: task } }, taskAccessWhere(user)] }, select: { ...fields, site: { select: { causaId: true } } } }) : [],
    message.length && canSome(user, "client.message") ? tx.message.findMany({ where: { id: { in: message }, receiverId: user.id }, select: { id: true } }) : [],
    callSubscriptions.length && academicNotices
      ? tx.altazorCallSubscription.findMany({ where: { id: { in: callSubscriptions }, ownerId: user.id }, select: { id: true } }) : [],
    teachingReminders.length && academicNotices
      ? tx.altazorTeachingSession.findMany({
        where: {
          id: { in: teachingReminders },
          reminderLeadMinutes: { not: null },
          workspace: { ownerId: user.id, archivedAt: null, kind: { in: [...ACADEMIC_TEACHING_TEMPLATES] } },
        },
        select: { id: true, startsAt: true, reminderLeadMinutes: true },
      }) : [],
  ]);
  const causesByResource = (rows: { id: string; causaId: string | null }[]) => new Map(rows.map(row => [row.id, row.causaId]));
  const byType = new Map([
    ["documento", causesByResource(documents)], ["plazo", causesByResource(deadlines)], ["minuta", causesByResource(minutes)],
    ["tramite", causesByResource(proceedings)], ["task", causesByResource(tasks.map(item => ({ id: item.id, causaId: item.causaId || item.site?.causaId || null })))],
    ["message", causesByResource(messages.map(item => ({ id: item.id, causaId: null })))],
    ["altazorcallsubscription", causesByResource(calls.map(item => ({ id: item.id, causaId: null })))],
  ]);
  const reminderKeys = new Map(reminders.flatMap(({ id, startsAt, reminderLeadMinutes }) =>
    reminderLeadMinutes === null ? [] : [[id, teachingReminderKey(id, startsAt, reminderLeadMinutes)] as const]));
  const resolved = candidates.flatMap(({ subject, id, type }) => {
    if (type === "altazorteachingreminder") {
      return id && subject.dedupeKey && reminderKeys.get(id) === subject.dedupeKey ? [{ subject, causaId: null }] : [];
    }
    if (id && type === "causa") return [{ subject, causaId: id }];
    const resources = id && type ? byType.get(type) : undefined;
    if (resources && id) {
      const causaId = resources.get(id);
      return causaId === undefined ? [] : [{ subject, causaId }];
    }
    const legacyCase = subject.href?.match(/^\/causas\/([^/?#]+)(?:[/?#]|$)/)?.[1];
    return [{ subject, causaId: subject.causaId || legacyCase || null }];
  });
  const causeIds = [...new Set(resolved.flatMap(item => item.causaId ? [item.causaId] : []))];
  const causes = causeIds.length ? await tx.causa.findMany({
    where: { AND: [{ id: { in: causeIds } }, causaAccessWhere(user)] }, select: { id: true },
  }) : [];
  const readable = new Set(causes.map(cause => cause.id));
  return resolved.filter(item => !item.causaId || readable.has(item.causaId)).map(item => item.subject);
}

/** Resolve the original resource again before delivery or acknowledgment. */
export async function canReceiveNotification(userId: string, subject: NotificationSubject, tx: Prisma.TransactionClient) {
  const user = await notificationActor(userId, tx);
  return Boolean(user && (await visibleNotificationSubjects(user, [subject], tx)).length);
}
