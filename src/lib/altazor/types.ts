import type { Prisma, PrismaClient } from "@prisma/client";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import type { LlmHistoryMessage } from "@/lib/ai/chat-history";
import type { AssistantTurnInput, AssistantTurnResult } from "@/lib/assistant/pipeline";
import type { AltazorSourceSnapshot } from "./resources";
export type { AltazorProgress } from "./progress";

export type AltazorClient = PrismaClient | Prisma.TransactionClient;
export type AltazorDestination = { provider: string; model: string; endpoint: string; endpointHash: string; remote: boolean; permitted: boolean; key: string };
export type AltazorContext = {
  version: 1;
  attachmentIds: string[];
  refs: AltazorSourceSnapshot[];
  historyTurnIds: string[];
  memoryDependencies: unknown[];
  recalledTurns?: { id: string; conversationId: string; fingerprint: string }[];
};
export type AltazorExecutionContext = { context: string; history: LlmHistoryMessage[]; snapshot: AltazorContext };
export type AltazorServiceOptions = {
  destination?: (userId: string) => Promise<AltazorDestination>;
  execute?: (input: AssistantTurnInput) => Promise<AssistantTurnResult>;
  memory?: (user: CausaAccessUser, input: { causaId?: string | null; query: string }) => Promise<{ context: string; dependencies: unknown[]; limited: boolean }>;
  assertMemory?: (user: CausaAccessUser, dependencies: unknown, input: { causaId?: string | null }) => Promise<void>;
};
export const ALTAZOR_LIMITS = { conversations: 100, attachments: 5, attachmentBytes: 25 * 1024 * 1024, conversationBytes: 100 * 1024 * 1024, contextCharacters: 32_000, historyTurns: 6, text: 8_000, turnsPerPage: 50, deadlineMs: 100_000, leaseMs: 120_000 } as const;
