import { apiMutation } from "@/lib/api-mutation";
import type { BookCitation, BookCitationInput, BookCollectionView, BookFragmentView, BookPreferences, BookSummary } from "@/lib/books/types";

export type BooksData = {
  books: BookSummary[]; collections: BookCollectionView[]; preferences: BookPreferences;
  limits?: { booksLimited?: boolean; collectionsLimited?: boolean };
};
export type BookDetail = {
  book: BookSummary; fragments: BookFragmentView[];
  pages: { pageNumber: number; method: string; status: string }[];
  nextAfter: number | null; limited: boolean;
};

export async function booksJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "No se pudo abrir la biblioteca. Actualice e intente de nuevo.");
  return data as T;
}

export function citationText(citation: BookCitation) {
  const edition = [citation.author, citation.title, citation.edition, citation.publisher, citation.year].filter(Boolean).join(". ");
  const textOnly = citation.verificationBasis === "retained_text";
  const basis = textOnly ? "Cotejada con texto conservado; original no conservado." : "Cotejada con el original conservado.";
  const hash = textOnly ? citation.retainedSha256 : citation.sourceSha256;
  return `“${citation.quote}”\n${edition} · ${citation.locatorLabel}\n${basis}${hash ? `\nSHA-256: ${hash}` : ""}\n${new URL(citation.href, window.location.origin).href}`;
}

/** Recheck the source immediately before copying, including shared-book access. */
export async function verifiedBookCitation(input: BookCitation | BookCitationInput) {
  const result = await apiMutation<{ verified: true; citation: BookCitation }>("/api/books/citations/verify", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ citation: input }),
  });
  if (!result.ok) throw new Error(result.error);
  return result.data.citation;
}

export async function copyBookText(text: string) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(text);
    return true;
  } catch { return false; }
}

export const bookStatusLabel: Record<string, string> = {
  completed: "Texto preparado", ready: "Texto preparado", partial: "Texto parcial", needs_ocr: "Revisión OCR pendiente",
  unsupported: "Formato sin texto", failed: "No se pudo preparar", processing: "Preparando texto", pending: "Preparación pendiente",
};
