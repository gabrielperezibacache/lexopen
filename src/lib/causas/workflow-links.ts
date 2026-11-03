/** Only identifiers travel between tools; source text stays in authorized reads. */
export function libraryBookHref(bookId: string, causaId?: string, draftId?: string) {
  const path = `/biblioteca/${encodeURIComponent(bookId)}`;
  return causaId ? withCaseBookContext(path, causaId, draftId) : path;
}

export function caseLibraryHref(causaId: string, draftId?: string) {
  const query = new URLSearchParams({ causa: causaId });
  if (draftId) query.set("escrito", draftId);
  return `/biblioteca?${query}`;
}

export function caseBookWritingHref(causaId: string, bookId: string, draftId?: string) {
  const query = new URLSearchParams({ fuentes: "book", libro: bookId });
  if (draftId) query.set("draft", draftId);
  return `/causas/${encodeURIComponent(causaId)}/escritos?${query}`;
}

export function withCaseBookContext(href: string, causaId?: string, draftId?: string) {
  if (!causaId || !href.startsWith("/biblioteca/")) return href;
  const url = new URL(href, "http://lexopen.local");
  url.searchParams.set("causa", causaId);
  if (draftId) url.searchParams.set("escrito", draftId);
  return `${url.pathname}${url.search}${url.hash}`;
}
