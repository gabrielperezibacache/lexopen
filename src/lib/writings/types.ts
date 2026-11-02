import type { ResolvedWritingSource, StoredWritingSource } from "./source-types";

export type WritingReference = { id: string; source: StoredWritingSource };
export type WritingReferenceView = { id: string; source: ResolvedWritingSource };
export type WritingDraftView = {
  id: string; causaId: string; title: string; body: string; revision: number;
  references: WritingReferenceView[]; canWrite: boolean; createdAt: string; updatedAt: string; warnings: string[];
};
export type WritingListItem = { id: string; available: false } | {
  id: string; available: true; title: string; revision: number; updatedAt: string;
};
export type WritingDraftList = { drafts: WritingListItem[]; canWrite: boolean; limited: boolean; nextAfter: string | null };
export type WritingChange = "created" | "saved" | "source_added" | "restored";
export type WritingHistoryEntry = { revision: number; available: false } | {
  revision: number; available: true; title: string; createdAt: string; change: WritingChange; restoredFrom: number | null;
};
export type WritingHistory = { revisions: WritingHistoryEntry[]; limited: boolean; nextBefore: number | null };
export type WritingRevisionView = {
  draftId: string; revision: number; title: string; body: string; references: WritingReferenceView[];
  createdAt: string; change: WritingChange; restoredFrom: number | null; canRestore: boolean; warnings: string[];
};
export type WritingMutationResult = { draft: WritingDraftView; reused: boolean };
