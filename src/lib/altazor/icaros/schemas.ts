import { z } from "zod";
import { altazorSourceInputSchema } from "../resource-input";

export const icaroId = z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);
const requestId = z.string().min(8).max(160).regex(/^[A-Za-z0-9_.:-]+$/);
const profile = {
  name: z.string().trim().min(1).max(80),
  instructions: z.string().trim().max(4000),
  provider: z.enum(["inherit", "study", "codex"]),
  model: z.string().trim().max(160).refine(value => !value || /^[A-Za-z0-9_.:/-]+$/.test(value), "El modelo no es válido"),
  memoryEnabled: z.boolean(),
};
export const createIcaroSchema = z.object({
  requestId, causaId: icaroId.nullish().transform(value => value || null), name: profile.name,
  instructions: profile.instructions.default(""), provider: profile.provider.default("inherit"), model: profile.model.default(""),
  memoryEnabled: profile.memoryEnabled.default(false), confirmed: z.literal(true),
}).strict();
export const updateIcaroSchema = z.object({
  expectedRevision: z.number().int().positive(), name: profile.name.optional(), instructions: profile.instructions.optional(),
  provider: profile.provider.optional(), model: profile.model.optional(), memoryEnabled: profile.memoryEnabled.optional(), enabled: z.boolean().optional(), confirmed: z.literal(true),
}).strict();
export const createIcaroJobSchema = z.object({
  requestId, instruction: z.string().trim().min(1).max(6000), text: z.string().max(10000).default(""),
  sources: z.array(altazorSourceInputSchema).max(8).default([]), useMemory: z.boolean().default(false),
  allowRemote: z.boolean().default(false), destinationKey: z.string().regex(/^[a-f0-9]{64}$/),
  parentJobId: icaroId.nullish().transform(value => value || null), confirmed: z.literal(true),
}).strict();
const memoryCommon = { requestId, label: z.string().trim().min(1).max(120), confirmed: z.literal(true) };
export const saveIcaroMemorySchema = z.union([
  z.object({ ...memoryCommon, body: z.string().trim().min(1).max(2000), sources: z.array(altazorSourceInputSchema).max(8).default([]) }).strict(),
  z.object({ ...memoryCommon, jobId: icaroId }).strict(),
]);
export const forgetIcaroMemorySchema = z.object({ expectedRevision: z.number().int().positive(), confirmed: z.literal(true) }).strict();
