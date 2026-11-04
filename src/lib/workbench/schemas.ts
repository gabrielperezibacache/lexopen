import { z } from "zod";
import { writingId, writingRequestId } from "@/lib/writings/schemas";
export const workbenchMode = z.enum(["source_packet", "assisted_draft"]);
export const workbenchSource = z.object({ fragmentId: writingId, versionId: writingId, quote: z.string().min(1).max(3_000) }).strict();
export const createWorkbenchSchema = z.object({ requestId: writingRequestId, objective: z.string().trim().min(10).max(2_000), mode: workbenchMode, destinationKey: z.string().regex(/^[a-f0-9]{64}$/), allowRemote: z.boolean().default(false), sources: z.array(workbenchSource).min(1).max(8) }).strict();
export const workbenchRunId = writingId;
export type WorkbenchMode = z.infer<typeof workbenchMode>;
