import { z } from "zod";

export const FACT_STATUSES = ["proposed", "accepted", "rejected", "hidden"] as const;
export const FACT_DATE_PRECISIONS = ["unknown", "ambiguous", "day", "month", "year", "range"] as const;
export const CONFLICT_KINDS = ["date", "money", "actor", "version", "claim"] as const;
export const CONFLICT_STATUSES = ["proposed", "apparent", "confirmed", "rejected"] as const;
const id = z.string().min(1).max(100);
export const knowledgeCitationInput = z.object({ kind: z.enum(["document", "legal"]), fragmentId: id, quote: z.string().min(1).max(10_000) }).strict();
const date = z.string().date();
const temporal = {
  dateLiteral: z.string().max(300).nullable().optional(),
  dateStart: date.nullable().optional(),
  dateEnd: date.nullable().optional(),
  datePrecision: z.enum(FACT_DATE_PRECISIONS).optional(),
  dateInferred: z.boolean().optional(),
  inferenceReason: z.string().trim().max(1000).nullable().optional(),
};
export const createCaseFactSchema = z.object({
  statement: z.string().trim().min(3).max(3000),
  citations: z.array(knowledgeCitationInput).min(1).max(5),
  comparisonKey: z.string().trim().min(1).max(100).nullable().optional(),
  highlighted: z.boolean().optional(),
  ...temporal,
}).strict();
export const updateCaseFactSchema = z.object({
  revision: z.number().int().min(1).max(2_147_483_646),
  statement: z.string().trim().min(3).max(3000).optional(),
  status: z.enum(FACT_STATUSES).optional(),
  highlighted: z.boolean().optional(),
  comparisonKey: z.string().trim().min(1).max(100).nullable().optional(),
  reason: z.string().trim().min(3).max(2000),
  ...temporal,
}).strict();
export const createCaseConflictSchema = z.object({
  leftFactId: id, rightFactId: id,
  kind: z.enum(CONFLICT_KINDS),
  reason: z.string().trim().min(10).max(3000),
}).strict().refine(input => input.leftFactId !== input.rightFactId, { message: "Seleccione dos hechos diferentes", path: ["rightFactId"] });
export const updateCaseConflictSchema = z.object({
  revision: z.number().int().min(1).max(2_147_483_646),
  status: z.enum(CONFLICT_STATUSES).optional(),
  kind: z.enum(CONFLICT_KINDS).optional(),
  reason: z.string().trim().min(10).max(3000),
  reviewReason: z.string().trim().min(3).max(2000),
}).strict();
export const analyzeCaseSourcesSchema = z.object({
  versionIds: z.array(id).min(1).max(20).optional(),
}).strict();
export type CreateCaseFactInput = z.infer<typeof createCaseFactSchema>;
export type UpdateCaseFactInput = z.infer<typeof updateCaseFactSchema>;
export type CreateCaseConflictInput = z.infer<typeof createCaseConflictSchema>;
export type UpdateCaseConflictInput = z.infer<typeof updateCaseConflictSchema>;
