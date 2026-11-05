import { AsyncLocalStorage } from "node:async_hooks";

/** Per-operation policy, isolated from other requests and from the Host's ordinary scraper configuration. */
const manualInteraction = new AsyncLocalStorage<{ downloadDocuments: boolean }>();
export function manualPjudInteractionActive() { return Boolean(manualInteraction.getStore()); }
export function manualPjudDocumentDownloadsAllowed() { return manualInteraction.getStore()?.downloadDocuments === true; }
export function withManualPjudInteraction<T>(work: () => T, options?: { downloadDocuments?: boolean }): T {
  return manualInteraction.run({ downloadDocuments: options?.downloadDocuments === true }, work);
}
