"use client";

import { useEffect, useState, type RefObject } from "react";

/** A visible desktop owns one abortable screenshot request at a time. */
export function useComputerScreen(enabled: boolean, sessionId: string, refresh: number, element: RefObject<HTMLElement | null>) {
  const [frame, setFrame] = useState<{ sessionId: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled || !sessionId || !element.current) return;
    let disposed = false, inView = typeof IntersectionObserver === "undefined";
    let request: AbortController | null = null, timer: number | undefined, displayed: string | null = null;
    const visible = () => !disposed && inView && document.visibilityState !== "hidden";
    const clearFrame = () => {
      if (displayed) URL.revokeObjectURL(displayed);
      displayed = null;
      if (!disposed) setFrame(null);
    };
    async function poll() {
      if (!visible() || request) return;
      const controller = new AbortController();
      request = controller;
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      let delay = 2_000;
      try {
        const response = await fetch(`/api/altazor/computer/sessions/${encodeURIComponent(sessionId)}/screenshot?frame=${refresh}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png")) throw new Error("screenshot_unavailable");
        const blob = await response.blob();
        if (!visible() || controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        if (displayed) URL.revokeObjectURL(displayed);
        displayed = url;
        setFrame({ sessionId, url }); setFailed(false);
      } catch {
        if (visible()) { clearFrame(); setFailed(true); }
        delay = 5_000;
      } finally {
        window.clearTimeout(timeout);
        if (request === controller) request = null;
        if (visible()) timer = window.setTimeout(() => void poll(), controller.signal.aborted ? 2_000 : delay);
      }
    }
    const synchronize = () => {
      window.clearTimeout(timer);
      if (!visible()) { request?.abort(); clearFrame(); return; }
      if (!request) void poll();
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => { inView = Boolean(entry?.isIntersecting); synchronize(); }, { rootMargin: "120px" });
    observer?.observe(element.current);
    document.addEventListener("visibilitychange", synchronize);
    if (!observer) queueMicrotask(synchronize);
    return () => {
      clearFrame(); disposed = true; window.clearTimeout(timer); request?.abort();
      observer?.disconnect(); document.removeEventListener("visibilitychange", synchronize);
    };
  }, [enabled, sessionId, refresh, element]);
  return { frame: enabled && frame?.sessionId === sessionId ? frame : null, failed };
}
