"use client";

import { useEffect, useState } from "react";
import type { Turn } from "./useAltazorCompanionState";

export type TimelineTurn = Turn & {
  conversationId: string;
  conversationTitle: string;
  conversationStatus: string;
  causaId: string | null;
};
type TimelinePage = { turns: TimelineTurn[]; before: string | null };
type TimelineState = { status: "ready" | "unavailable"; cursor: string | null; page: TimelinePage | null };

async function readPage(signal: AbortSignal, before?: string | null): Promise<TimelinePage> {
  const query = before ? `?${new URLSearchParams({ before })}` : "";
  const response = await fetch(`/api/altazor/timeline${query}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Timeline unavailable");
  return response.json();
}

export function useAltazorTimeline(enabled: boolean, version: string, working: boolean) {
  const [state, setState] = useState<TimelineState | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let request: AbortController | null = null;
    let disposed = false;
    let timer: number | undefined;

    async function refresh() {
      if (request || disposed || document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      const controller = new AbortController();
      request = controller;

      try {
        const page = await readPage(controller.signal, cursor);
        if (!controller.signal.aborted) setState({ status: "ready", page, cursor });
      } catch {
        if (!controller.signal.aborted) setState({ status: "unavailable", page: null, cursor });
      } finally {
        if (request === controller) request = null;
        if (!controller.signal.aborted) timer = window.setTimeout(refresh, !cursor && working ? 2_000 : 15_000);
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void refresh();
      else {
        request?.abort();
        request = null;
        window.clearTimeout(timer);
      }
    }

    void refresh();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      request?.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, cursor, refreshKey, version, working]);

  const current = state?.cursor === cursor ? state : null;
  const page = current?.page;
  return {
    turns: page?.turns ?? [],
    status: current?.status ?? "loading",
    readingOlder: cursor !== null,
    hasMore: Boolean(page?.before),
    loadOlder: () => { if (page?.before) setCursor(page.before); },
    returnToLatest: () => setCursor(null),
    refresh: () => setRefreshKey(key => key + 1),
  };
}
