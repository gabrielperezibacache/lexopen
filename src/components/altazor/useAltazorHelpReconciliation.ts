"use client";
import { useCallback, useEffect, useRef } from "react";
import { apiMutation } from "@/lib/api-mutation";

/** One reconciler belongs to the keyed user provider, across pages and panels. */
export function useAltazorHelpReconciliation() {
  const flight = useRef<{ controller: AbortController; promise: Promise<unknown> } | null>(null);
  const nextAttempt = useRef(0), forbidden = useRef(false), failures = useRef(0);
  const reconcile = useCallback((manual = false): Promise<unknown> => {
    if (flight.current) return flight.current.promise;
    if (!manual && (forbidden.current || Date.now() < nextAttempt.current)) return Promise.resolve(null);
    const controller = new AbortController();
    nextAttempt.current = Date.now() + 20_000;
    const promise = apiMutation<unknown>("/api/altazor/help/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal })
      .then(result => {
        if (!result.ok) {
          if ([401, 403].includes(result.status)) forbidden.current = true;
          failures.current++;
          nextAttempt.current = Date.now() + Math.min(300_000, result.status === 429 ? 60_000 : 20_000 * 2 ** Math.min(failures.current, 4));
          throw Object.assign(Error(result.error), { status: result.status });
        }
        forbidden.current = false; failures.current = 0;
        return result.data;
      }).finally(() => { if (flight.current?.controller === controller) flight.current = null; });
    flight.current = { controller, promise };
    return promise;
  }, []);
  useEffect(() => {
    let disposed = false, polling = false, timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (disposed || polling) return;
      polling = true;
      if (document.visibilityState === "visible") await reconcile().catch(() => {});
      polling = false;
      if (!disposed) timer = setTimeout(poll, 20_000);
    };
    const visible = () => { if (document.visibilityState === "visible") { clearTimeout(timer); void poll(); } };
    queueMicrotask(() => void poll());
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; clearTimeout(timer); flight.current?.controller.abort(); document.removeEventListener("visibilitychange", visible); };
  }, [reconcile]);
  return reconcile;
}
