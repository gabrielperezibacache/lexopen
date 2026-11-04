import { z } from "zod";
import { writingId, writingSourceInputSchema } from "@/lib/writings/schemas";
export const altazorSourceInputSchema = z.union([
  writingSourceInputSchema,
  z.object({ kind: z.literal("legal"), fragmentId: writingId, versionId: writingId, quote: z.string().min(1).max(3000) }).strict(),
]).refine(input => !("quote" in input) || input.quote.length <= 3000, "Seleccione un pasaje de hasta 3.000 caracteres");
export type AltazorSourceInput = z.infer<typeof altazorSourceInputSchema>;
