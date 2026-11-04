import type { Prisma, PrismaClient } from "@prisma/client";
import type { BookCitation } from "@/lib/books/types";
import type { StoredCitation } from "@/lib/knowledge/citations";
import type { HearingCitationStored } from "@/lib/hearings/types";

export type WritingSourceClient = PrismaClient | Prisma.TransactionClient;
export type WritingSourceInput =
  | { kind: "document"; fragmentId: string; versionId: string; quote: string }
  | { kind: "fact"; factId: string; revision: number }
  | { kind: "note"; workspaceId: string; noteId: string; revision: number }
  | { kind: "book"; bookId: string; fragmentId: string; quote: string };

export type WritingCitation = {
  kind: "knowledge" | "book" | "hearing";
  snapshot: StoredCitation | BookCitation | HearingCitationStored;
  workspaceId?: string;
  title: string; reference: string; locator: string; href: string; quote: string;
  sourceKey: string; sourceSha256: string; textSha256: string; quoteSha256: string;
  pageNumber: number | null;
  verificationBasis: "original" | "retained_text";
  retainedSha256: string | null;
  warnings: string[];
};
/** Constructed by the server, never accepted from a save request. */
export type StoredWritingSource = {
  version: 1; kind: WritingSourceInput["kind"]; input: WritingSourceInput;
  originId: string; revision: number | null; title: string; text: string; href: string;
  citations: WritingCitation[]; warnings: string[]; fingerprint: string;
};
export type ResolvedWritingSource = StoredWritingSource;
export type WritingSourceCandidate = {
  input: WritingSourceInput; kind: WritingSourceInput["kind"];
  title: string; text: string; href: string; review: string; warnings: string[];
  citationCount: number;
};
export type WritingSourceCatalogQuery = { kind?: WritingSourceInput["kind"]; q?: string; bookId?: string; after?: string };
export type WritingSourceCatalog = {
  kind: WritingSourceInput["kind"]; candidates: WritingSourceCandidate[];
  books: { id: string; title: string; owned: boolean }[];
  nextAfter: string | null; limited: boolean; warnings: string[];
  coverage: { networkRequests: 0; modelUsed: false; scope: string };
};
