"use client";

import Image from "next/image";
import { ArrowUpRight, Monitor } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ComputerActivity, ComputerActivityState } from "@/lib/altazor/computer/types";
import styles from "./AltazorDesktopActivity.module.css";

const endpoint = "/api/altazor/computer";
const stateLabel: Record<ComputerActivityState, string> = {
  disabled: "Escritorio desactivado",
  unconfigured: "Por preparar",
  restricted: "No disponible con la configuración actual",
  idle: "Sin escritorio abierto",
  starting: "Abriendo escritorio…",
  ready: "Escritorio abierto",
  working: "Altazor está trabajando",
  approval: "Espera tu confirmación",
  paused: "Vista pausada durante el control manual",
  expired: "Acceso vencido",
  unavailable: "Vista no disponible",
};
const frameStates: ReadonlySet<ComputerActivityState> = new Set(["ready", "working", "approval"]);

export function AltazorDesktopActivity({ causaId, onOpen }: { causaId: string | null; onOpen: (sessionId: string | null) => void }) {
  const heading = useId(), container = useRef<HTMLElement>(null);
  const [activity, setActivity] = useState<ComputerActivity | null>(null);
  const [frame, setFrame] = useState<{ url: string; sessionId: string } | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let inView = typeof IntersectionObserver === "undefined", running = false, disposed = false;
    let timer: number | undefined, request: AbortController | undefined, displayed: string | null = null;
    const replaceFrame = (next: { url: string; sessionId: string } | null) => {
      if (displayed) URL.revokeObjectURL(displayed);
      displayed = next?.url ?? null;
      if (!disposed) setFrame(next);
    };
    const pause = () => {
      running = false;
      window.clearTimeout(timer);
      request?.abort();
      request = undefined;
      replaceFrame(null);
    };
    async function poll() {
      const controller = new AbortController();
      request = controller;
      const { signal } = controller;
      let delay = 25_000;
      try {
        const query = causaId ? `?${new URLSearchParams({ causaId })}` : "";
        const response = await fetch(`${endpoint}/activity${query}`, { cache: "no-store", signal });
        if (!response.ok) throw new Error("activity_unavailable");
        const next: ComputerActivity = await response.json();
        if (signal.aborted) return;
        setActivity(next);
        if (!next.monitor) { pause(); return; }
        delay = next.state === "working" || next.state === "starting" ? 5_000 : next.sessionId ? 9_000 : 25_000;
        if (!next.sessionId || !frameStates.has(next.state)) { replaceFrame(null); return; }
        const image = await fetch(`${endpoint}/sessions/${encodeURIComponent(next.sessionId)}/screenshot?passive=1`, { cache: "no-store", signal });
        if (!image.ok || !image.headers.get("content-type")?.startsWith("image/png")) {
          replaceFrame(null);
          if (image.status === 409) delay = 5_000;
          else setActivity({ state: "unavailable", sessionId: next.sessionId, monitor: true });
          return;
        }
        const blob = await image.blob();
        if (!signal.aborted) replaceFrame({ url: URL.createObjectURL(blob), sessionId: next.sessionId });
      } catch {
        if (!signal.aborted) { replaceFrame(null); setActivity({ state: "unavailable", sessionId: null, monitor: true }); }
      } finally {
        if (request === controller) request = undefined;
        if (running && !signal.aborted) timer = window.setTimeout(() => void poll(), delay);
      }
    }
    const synchronize = () => {
      if (!inView || document.visibilityState === "hidden") { pause(); return; }
      if (!running) { running = true; void poll(); }
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => { inView = Boolean(entry?.isIntersecting); synchronize(); }, { rootMargin: "120px" });
    observer?.observe(element);
    document.addEventListener("visibilitychange", synchronize);
    if (!observer) synchronize();
    return () => { disposed = true; pause(); observer?.disconnect(); document.removeEventListener("visibilitychange", synchronize); };
  }, [causaId]);

  const label = activity ? stateLabel[activity.state] : "Consultando escritorio…";
  const needsPreparation = activity?.state === "unconfigured" || activity?.state === "disabled";
  return <section className={styles.activity} aria-labelledby={heading} ref={container}>
    <header className={styles.header}>
      <Monitor aria-hidden="true" size={20} />
      <div className={styles.heading}><h2 id={heading}>Escritorio de Altazor</h2><p role="status">{label}</p></div>
      <button type="button" className="btn btn-ghost" onClick={() => onOpen(activity?.sessionId ?? null)}>
        {needsPreparation ? "Preparar escritorio" : "Abrir escritorio"}<ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </header>
    {frame && activity && frame.sessionId === activity.sessionId && frameStates.has(activity.state) && <div className={styles.screen}>
      <Image src={frame.url} unoptimized width={1280} height={800} alt="Vista actual del escritorio privado de Altazor" />
    </div>}
  </section>;
}
