import { AsyncLocalStorage } from "node:async_hooks";

/** Per-operation policy, isolated from other requests and from the Host's ordinary scraper configuration. */
const manualInteraction = new AsyncLocalStorage<boolean>();
export function manualPjudInteractionActive() { return manualInteraction.getStore() === true; }
export function withManualPjudInteraction<T>(work: () => T): T { return manualInteraction.run(true, work); }
