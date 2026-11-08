import { z } from "zod";
import { hearingId, hearingRevision } from "./schemas";

export const hearingPromotionPreviewSchema = z.object({ noteId: hearingId, revision: z.coerce.number().int().min(1).max(2_000_000_000) }).strict();
export const hearingPromotionSchema = z.object({
  requestId: z.string().min(10).max(120).regex(/^[a-zA-Z0-9-]+$/),
  source: z.object({ noteId: hearingId, revision: hearingRevision }).strict(),
  target: z.enum(["fact", "note", "writing"]),
  title: z.string().trim().min(1).max(180),
  body: z.string().trim().min(3).max(100_000),
  reviewed: z.literal(true),
}).strict().superRefine((input, context) => {
  const maximum = input.target === "fact" ? 3000 : input.target === "note" ? 20_000 : 100_000;
  if (input.body.length > maximum) context.addIssue({ code: "too_big", maximum, inclusive: true, origin: "string", message: `El texto admite hasta ${maximum} caracteres para este destino`, path: ["body"] });
});
