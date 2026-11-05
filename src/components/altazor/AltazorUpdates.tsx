"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import type { AltazorUpdate } from "@/lib/altazor/updates";
import { AltazorMark } from "./AltazorMark";

type UpdatesState = { updates: AltazorUpdate[]; status: "loading" | "ready" | "unavailable" };

export function useAltazorUpdates(): UpdatesState {
  const [state, setState] = useState<UpdatesState>({ updates: [], status: "loading" });

  useEffect(() => {
    let current: AbortController | null = null;
    async function refresh() {
      if (document.visibilityState !== "visible" || current) return;
      const controller = new AbortController();
      current = controller;
      try {
        const response = await fetch("/api/altazor/updates", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Updates unavailable");
        const { updates } = await response.json() as { updates: AltazorUpdate[] };
        if (!controller.signal.aborted) setState({ updates, status: "ready" });
      } catch {
        if (!controller.signal.aborted) setState({ updates: [], status: "unavailable" });
      } finally {
        if (current === controller) current = null;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void refresh();
      else { current?.abort(); current = null; }
    }

    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      current?.abort();
    };
  }, []);

  return state;
}

const shortDate = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dueDate = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function AltazorUpdateMessage({ update }: { update: AltazorUpdate }) {
  return (
    <article className="altazor-update-message">
      <div className="altazor-answer-author"><AltazorMark size={36} state="reading" /><strong>Altazor</strong><span><Bell size={14} aria-hidden="true" /> Aviso</span></div>
      <div className="altazor-update-heading">
        <strong>{update.title}</strong>
        <time dateTime={update.occurredAt}>{shortDate.format(new Date(update.occurredAt))}</time>
      </div>
      <p>{update.message}</p>
      {update.dueAt && <p>Vencimiento <time dateTime={update.dueAt}>{dueDate.format(new Date(update.dueAt))}</time></p>}
      <Link href={update.href}>{update.kind === "court-mail" ? "Abrir correo" : "Ver plazos del mes"}</Link>
    </article>
  );
}
