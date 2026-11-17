import { z } from "zod";
export const completionSupportSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("manual"),
      justification: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("document"),
      documentoId: z.string().regex(/^[\w-]{1,100}$/),
      version: z.number().int().positive(),
    })
    .strict(),
]);
export type CompletionSupport = z.infer<typeof completionSupportSchema>;
export const deadlineStateSchema = z
  .object({
    id: z.string().min(1).max(100),
    estado: z.enum(["pendiente", "cumplido", "vencido", "suspendido"]),
    expectedVersion: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    completion: completionSupportSchema.optional(),
  })
  .strict();
