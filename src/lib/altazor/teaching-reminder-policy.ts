import { z } from "zod";

export const TEACHING_REMINDER_LEADS = [15, 60, 1440, 10080] as const;
export type TeachingReminderLead = (typeof TEACHING_REMINDER_LEADS)[number];

export const teachingReminderLeadSchema = z.number().refine(
  (value): value is TeachingReminderLead => TEACHING_REMINDER_LEADS.some(lead => lead === value),
  "Elige una antelación de recordatorio válida.",
).nullable();

export function teachingReminderFields(startsAt: Date, leadMinutes: number | null) {
  return {
    reminderLeadMinutes: leadMinutes,
    reminderDueAt: leadMinutes === null ? null : new Date(startsAt.getTime() - leadMinutes * 60_000),
  };
}

/** The same occurrence and lead time identify one in-app notice, even across retries. */
export function teachingReminderKey(sessionId: string, startsAt: Date, leadMinutes: number) {
  return `academic-teaching-reminder:${sessionId}:${startsAt.getTime()}:${leadMinutes}`;
}
