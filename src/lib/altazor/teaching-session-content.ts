import { z } from "zod";

export const TEACHING_CONTENT_LIMITS = { itemsPerGroup: 12, titleLength: 200, outcomeLength: 500, hrefLength: 1000, nameLength: 200, locationLength: 600 } as const;

function singleLine(length: number) {
  return z.string().trim().min(1).max(length)
    .regex(/^[^\p{Cc}\p{Zl}\p{Zp}]+$/u, "Escribe cada elemento en una sola línea.");
}

export function isTeachingLibraryHref(value: string) {
  const match = /^\/biblioteca\/[A-Za-z0-9_-]{1,160}(?:\?fragment=([1-9]\d{0,15})#fragment-\1)?$/.exec(value);
  return Boolean(match && (!match[1] || Number.isSafeInteger(Number(match[1]))));
}

function isTeachingResourceHref(value: string) {
  if (isTeachingLibraryHref(value)) return true;
  if (!/^https:\/\//i.test(value) || /[\s\p{Cc}\\<>]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

const resource = z.object({
  title: singleLine(TEACHING_CONTENT_LIMITS.titleLength),
  href: z.string().trim().max(TEACHING_CONTENT_LIMITS.hrefLength)
    .refine(isTeachingResourceHref, "Usa un enlace HTTPS o un enlace a un libro o fragmento de la Biblioteca.").optional(),
}).strict();

export const teachingSessionContentSchema = z.object({
  readings: z.array(resource).max(TEACHING_CONTENT_LIMITS.itemsPerGroup),
  materials: z.array(resource).max(TEACHING_CONTENT_LIMITS.itemsPerGroup),
  outcomes: z.array(singleLine(TEACHING_CONTENT_LIMITS.outcomeLength)).max(TEACHING_CONTENT_LIMITS.itemsPerGroup),
  speakers: z.array(singleLine(TEACHING_CONTENT_LIMITS.nameLength)).max(TEACHING_CONTENT_LIMITS.itemsPerGroup).optional(),
  moderators: z.array(singleLine(TEACHING_CONTENT_LIMITS.nameLength)).max(TEACHING_CONTENT_LIMITS.itemsPerGroup).optional(),
  location: singleLine(TEACHING_CONTENT_LIMITS.locationLength).optional(),
}).strict();

export type TeachingSessionContent = z.infer<typeof teachingSessionContentSchema>;

export function emptyTeachingSessionContent(): TeachingSessionContent {
  return { readings: [], materials: [], outcomes: [] };
}

const storedTeachingSessionContent = teachingSessionContentSchema.partial().strict();

export function readTeachingSessionContent(contentJson: string): TeachingSessionContent {
  return { ...emptyTeachingSessionContent(), ...storedTeachingSessionContent.parse(JSON.parse(contentJson)) };
}

export const teachingSessionContentMutationSchema = z.object({
  expectedRevision: z.number().int().min(0).max(2_147_483_647),
  content: teachingSessionContentSchema,
}).strict();
