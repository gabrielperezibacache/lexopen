/**
 * Structured JSON logs with optional request correlation.
 * Prefer `log.info/warn/error` over bare console in new server code.
 * Uses AsyncLocalStorage so concurrent requests do not clobber requestId.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type LogFields = Record<string, unknown>;

const requestIdAls = new AsyncLocalStorage<string>();

/** Bind a request id for the current async context (Node route helpers). */
export function setRequestId(id: string | null) {
  if (!id) return;
  // Enter a new store for the remainder of the async chain when possible.
  requestIdAls.enterWith(id);
}

export function getRequestId(): string | null {
  return requestIdAls.getStore() ?? null;
}

export function newRequestId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}`;
}

/** Run `fn` with a bound request id (preferred over setRequestId). */
export function runWithRequestId<T>(id: string, fn: () => T): T {
  return requestIdAls.run(id, fn);
}

function emit(
  level: "info" | "warn" | "error",
  msg: string,
  fields?: LogFields
) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(getRequestId() ? { requestId: getRequestId() } : {}),
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
};
