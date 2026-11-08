import type { AltazorDestination } from "../types";

export const ICARO_LIMITS = { profiles: 20, queuedPerOwner: 10, concurrentPerOwner: 2, depth: 1, memories: 32, memoryEntriesInContext: 6, memoryCharacters: 6000, contextCharacters: 32000, deadlineMs: 45000, leaseMs: 60000 } as const;
export type IcaroProvider = "inherit" | "study" | "codex";
export type IcaroJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "blocked" | "interrupted";
export type IcaroDestination = AltazorDestination & { routeProvider: "study" | "codex" };
export type IcaroView = {
  id: string; name: string; instructions: string; causaId: string | null; scopeKey: string;
  provider: IcaroProvider; model: string; memoryEnabled: boolean; enabled: boolean; revision: number;
  destination: IcaroDestination; createdAt: string; updatedAt: string;
};
export type IcaroJobView = {
  id: string; icaroId: string; icaroName: string; status: IcaroJobStatus; available: boolean;
  instruction: string; explicitText: string; result: string; destination: IcaroDestination;
  useMemory: boolean; depth: number; parentJobId: string | null; errorCode: string | null;
  createdAt: string; startedAt: string | null; finishedAt: string | null;
};
export type IcaroMemoryView = { id: string; label: string; body: string; revision: number; sourceJobId: string | null; available: boolean; createdAt: string };
