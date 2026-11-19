import { caseViewParams } from "./portfolio-navigation";

type CurrentQuery = Pick<URLSearchParams, "get">;

function viewParams(causaId: string, draftId?: string, current?: CurrentQuery) {
  return caseViewParams(causaId, { escrito: draftId, mesa: current?.get("mesa"), volver: current?.get("volver") });
}

/** Carry only the case, draft, hearing desk and allowed portfolio return address. */
export function libraryBookHref(bookId: string, causaId?: string, draftId?: string, current?: CurrentQuery) {
  return withCaseBookContext(`/biblioteca/${encodeURIComponent(bookId)}`, causaId, draftId, current);
}

export function caseLibraryHref(causaId: string, draftId?: string, current?: CurrentQuery) {
  return withCaseBookContext("/biblioteca", causaId, draftId, current);
}

export function caseBookWritingHref(causaId: string, bookId: string, draftId?: string, current?: CurrentQuery) {
  const query = new URLSearchParams({ fuentes: "book", libro: bookId });
  for (const [key, value] of viewParams(causaId, draftId, current)) query.set(key === "escrito" ? "draft" : key, value);
  return `/causas/${encodeURIComponent(causaId)}/escritos?${query}`;
}

export function withCaseBookContext(href: string, causaId?: string, draftId?: string, current?: CurrentQuery) {
  if (!causaId || !(href === "/biblioteca" || href.startsWith("/biblioteca/"))) return href;
  const url = new URL(href, "http://lexopen.local");
  if (url.pathname !== "/biblioteca" && !/^\/biblioteca\/[^/]+$/.test(url.pathname)) return href;
  for (const key of ["escrito", "mesa", "volver"]) url.searchParams.delete(key);
  url.searchParams.set("causa", causaId);
  for (const [key, value] of viewParams(causaId, draftId, current)) url.searchParams.set(key, value);
  return url.pathname + url.search + url.hash;
}
