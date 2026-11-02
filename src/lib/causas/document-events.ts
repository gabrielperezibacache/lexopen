/** Browser notifications carry only a case identity; readers obtain fresh, authorized data. */
export const CASE_DOCUMENTS_CHANGED = "lexopen:case-documents-changed";

const browserTarget = (): EventTarget | null => typeof window === "undefined" ? null : window;

export function notifyCaseDocumentsChanged(causaId: string, target: EventTarget | null = browserTarget()) {
  target?.dispatchEvent(new CustomEvent(CASE_DOCUMENTS_CHANGED, { detail: { causaId } }));
}

export function subscribeCaseDocumentsChanged(causaId: string, changed: () => void, target: EventTarget | null = browserTarget()) {
  if (!target) return () => {};
  const listener = (event: Event) => {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (detail && typeof detail === "object" && "causaId" in detail && detail.causaId === causaId) changed();
  };
  target.addEventListener(CASE_DOCUMENTS_CHANGED, listener);
  return () => target.removeEventListener(CASE_DOCUMENTS_CHANGED, listener);
}
