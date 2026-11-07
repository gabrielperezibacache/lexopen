import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { altazorActor, altazorTransaction } from "./access";
import { ACADEMIC_TEACHING_TEMPLATES, academicHref } from "./academic-templates";
import { teachingReminderFields, teachingReminderKey, teachingReminderLeadSchema } from "./teaching-reminder-policy";

const activeTeaching = { archivedAt: null, kind: { in: [...ACADEMIC_TEACHING_TEMPLATES] } };
const reminderType = "AltazorTeachingReminder";

export const teachingReminderMutationSchema = z.object({
  reminderLeadMinutes: teachingReminderLeadSchema,
}).strict();

export async function changeTeachingReminder(
  workspaceId: string, sessionId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma,
) {
  const { reminderLeadMinutes } = teachingReminderMutationSchema.parse(raw);
  return altazorTransaction(client, async tx => {
    const actor = await altazorActor(user, tx);
    const row = await tx.altazorTeachingSession.findFirst({
      where: { id: sessionId, workspaceId, workspace: { ...activeTeaching, ownerId: actor.id } },
      select: { id: true, startsAt: true, reminderLeadMinutes: true, updatedAt: true },
    });
    if (!row) throw httpError("La actividad o el trabajo docente no están disponibles.", 404);
    if (row.reminderLeadMinutes === reminderLeadMinutes) return { id: row.id, reminderLeadMinutes };
    if (reminderLeadMinutes !== null && row.startsAt <= new Date()) {
      throw httpError("La actividad ya comenzó. Elige una actividad futura para crear un recordatorio.", 409);
    }
    await tx.altazorTeachingSession.update({
      where: { id: row.id },
      data: { ...teachingReminderFields(row.startsAt, reminderLeadMinutes), updatedAt: row.updatedAt },
      select: { id: true },
    });
    await writeAuditStrict({
      actorId: actor.id, action: "altazor.teaching.reminder", entityType: reminderType, entityId: row.id,
    }, tx);
    return { id: row.id, reminderLeadMinutes };
  });
}

export async function runDueTeachingReminders({
  client = prisma, now = new Date(), limit = 50,
}: { client?: PrismaClient; now?: Date; limit?: number } = {}) {
  const take = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 100)) : 50;
  return altazorTransaction(client, async tx => {
    const due = await tx.altazorTeachingSession.findMany({
      where: {
        reminderLeadMinutes: { not: null }, reminderDueAt: { lte: now }, startsAt: { gt: now },
        workspace: activeTeaching,
      },
      select: {
        id: true, startsAt: true, updatedAt: true, reminderLeadMinutes: true, workspaceId: true,
        workspace: { select: { owner: { select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } } } },
      },
      orderBy: [{ reminderDueAt: "asc" }, { id: "asc" }],
      take,
    });
    let disabled = 0;
    const notices = [];
    for (const session of due) {
      const lead = session.reminderLeadMinutes;
      if (lead === null) continue;
      const { owner } = session.workspace;
      if (!isStaff(owner.role) || !canSome(owner, "assistant.use")) {
        await tx.altazorTeachingSession.update({
          where: { id: session.id },
          data: { ...teachingReminderFields(session.startsAt, null), updatedAt: session.updatedAt },
          select: { id: true },
        });
        disabled++;
        continue;
      }
      // Clearing the due time and inserting the notice share the same serializable
      // transaction, so a reschedule or cancellation cannot race a stale delivery.
      await tx.altazorTeachingSession.update({
        where: { id: session.id }, data: { reminderDueAt: null, updatedAt: session.updatedAt }, select: { id: true },
      });
      notices.push({
        userId: owner.id,
        tipo: "academico.recordatorio", severidad: "media",
        title: "Recordatorio de Docencia",
        body: "Tienes una actividad próxima. Consulta el horario en tu Agenda.",
        href: `${academicHref(session.workspaceId)}#agenda-docencia`,
        entityType: reminderType, entityId: session.id,
        dedupeKey: teachingReminderKey(session.id, session.startsAt, lead),
        createdAt: now,
      });
    }
    // Private in-app notices do not enter the external notification outbox.
    const delivered = notices.length ? (await tx.notification.createMany({ data: notices, skipDuplicates: true })).count : 0;
    return { delivered, disabled };
  });
}
