import type { BookSourceType, JudicialMetadata } from "./judicial";
export type { BookSourceType, JudicialMetadata } from "./judicial";
export const BOOK_COLORS = ["oxblood", "forest", "navy", "cognac", "ivory", "charcoal"] as const;
export const BOOK_STYLES = ["leather", "linen", "minimal"] as const;
export type BookSummary = {
  id: string; ownerId: string; ownerName: string; owned: boolean; title: string; author: string; year: string; edition: string; publisher: string; identifier: string;
  sourceType: BookSourceType; judicial: JudicialMetadata | null;
  coverColor: string; coverStyle: string; spineLabel: string; shelf: string; favorite: boolean;
  sourceName: string; mimeType: string; sourceSha256: string; originalRetained: boolean; convertedToText: boolean; retainedSha256: string | null; originalBytes: number | null; retainedBytes: number | null; conversionJson: string; status: string; pageCount: number | null; locatorKind: string; revision: number; fragmentCount: number; createdAt: string;
};
export type BookFragmentView = { id: string; ordinal: number; text: string; pageNumber: number | null; locatorLabel: string };
export type BookCitationInput = { bookId: string; fragmentId: string; quote: string };
export type BookCitation = BookCitationInput & {
  sourceType?: BookSourceType; judicial?: JudicialMetadata | null;
  sourceKind: "library_book"; verificationBasis?: "original" | "retained_text"; retainedSha256?: string | null; ordinal: number; quoteSha256: string; textSha256: string; sourceSha256: string; sourceKey: string;
  pageNumber: number | null; locatorLabel: string; href: string; title: string; author: string; year: string; edition: string; publisher: string; extractionMethod: string; partial: boolean;
};
export type BookCollectionView = { id: string; name: string; ownerId: string; ownerName: string; owned: boolean; revision: number; bookIds: string[]; memberIds: string[]; memberCount: number };
export type BookPreferences = { layout: "mesa" | "estantes" | "gabinete" | "galeria" | "archivo" | "salon"; libraryName: string; shelfTheme: "walnut" | "oak" | "night"; view: "covers" | "spines"; defaultConvertToText: boolean; defaultPreserveOriginal: boolean; heavyFileThresholdMb: number };
