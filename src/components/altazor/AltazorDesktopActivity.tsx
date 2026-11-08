"use client";

import Image from "next/image";
import { ArrowUpRight, FileCheck2, Monitor } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ComputerActivity, ComputerActivityState, ComputerReview, VerifiedComputerFile } from "@/lib/altazor/computer/types";
import { computerConnectionLabel } from "@/lib/altazor/computer/activity-detail";
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
  help: "Altazor necesita tu ayuda",
  paused: "Vista pausada durante el control manual",
  expired: "Acceso vencido",
  unavailable: "Vista no disponible",
};
const frameStates: ReadonlySet<ComputerActivityState> = new Set(["ready", "working", "approval", "help"]);

export function AltazorDesktopActivity({ causaId, refreshKey, onOpen }: { causaId: string | null; refreshKey?: string; onOpen: (sessionId: string | null, sessionCaseId: string | null, review?: ComputerReview) => void }) {
  const heading = useId(), container = useRef<HTMLElement>(null);
  const sessionPin = useRef<{ id: string; causaId: string | null } | null>(null);
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
      let timedOut = false;
      const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
      let delay = 25_000;
      try {
        const query = causaId ? `?${new URLSearchParams({ causaId })}` : "";
        const pin = sessionPin.current;
        const preserveSession = pin && pin.causaId !== causaId;
        const pinQuery = preserveSession ? `?${new URLSearchParams({ sessionId: pin.id })}` : query;
        let response = await fetch(`${endpoint}/activity${pinQuery}`, { cache: "no-store", signal });
        let next: ComputerActivity | null = response.ok ? await response.json() : null;
        if (preserveSession && (response.status === 404 || next?.state === "idle")) {
          sessionPin.current = null;
          replaceFrame(null);
          response = await fetch(`${endpoint}/activity${query}`, { cache: "no-store", signal });
          next = response.ok ? await response.json() : null;
        }
        if (!next) throw new Error("activity_unavailable");
        if (signal.aborted) return;
        sessionPin.current = next.sessionId && next.state !== "expired" ? { id: next.sessionId, causaId: next.causaId ?? (preserveSession ? pin.causaId : causaId) } : null;
        setActivity(next);
        if (!next.monitor) { pause(); return; }
        delay = frameStates.has(next.state) ? 1_000 : next.state === "starting" ? 2_000 : next.sessionId ? 5_000 : 15_000;
        if (!next.sessionId || !frameStates.has(next.state)) { replaceFrame(null); return; }
        const image = await fetch(`${endpoint}/sessions/${encodeURIComponent(next.sessionId)}/screenshot?passive=1`, { cache: "no-store", signal });
        if (!image.ok || !image.headers.get("content-type")?.startsWith("image/png")) {
          replaceFrame(null);
          delay = 5_000;
          if (image.status === 409) setActivity({ state: "paused", sessionId: next.sessionId, monitor: true });
          else setActivity({ state: "unavailable", sessionId: next.sessionId, monitor: true });
          return;
        }
        const blob = await image.blob();
        if (!signal.aborted) replaceFrame({ url: URL.createObjectURL(blob), sessionId: next.sessionId });
      } catch {
        if (!signal.aborted || timedOut) { replaceFrame(null); setActivity({ state: "unavailable", sessionId: null, monitor: true }); }
      } finally {
        window.clearTimeout(timeout);
        if (request === controller) request = undefined;
        if (running) timer = window.setTimeout(() => void poll(), timedOut ? 5_000 : delay);
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
  }, [causaId, refreshKey]);

  const label = activity ? stateLabel[activity.state] : "Consultando escritorio…";
  const needsPreparation = activity?.state === "unconfigured" || activity?.state === "disabled";
  const review = activity?.state === "help" || activity?.state === "approval" ? activity.state : undefined;
  const visibleFrame = frame && activity && frame.sessionId === activity.sessionId && frameStates.has(activity.state) ? frame : null;
  return <section className={styles.activity} aria-labelledby={heading} ref={container}>
    <header className={styles.header}>
      <Monitor aria-hidden="true" size={20} />
      <div className={styles.heading}><h2 id={heading}>Escritorio de Altazor</h2><p role="status">{label}</p></div>
      <button type="button" className={review ? "btn btn-primary" : "btn btn-ghost"} onClick={() => onOpen(activity?.sessionId ?? null, activity?.causaId === undefined ? causaId : activity.causaId, review)}>
        {activity?.consultation ? "Revisar acción" : review === "help" ? "Revisar solicitud" : review === "approval" ? "Revisar autorización" : needsPreparation ? "Preparar escritorio" : "Abrir escritorio"}<ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </header>
    {activity?.consultation && <p className={styles.consultation}>{activity.consultation.reason}</p>}
    {activity?.outcomeUnknown && <p className={styles.consultation}>Una acción quedó sin confirmar. Revisa el monitor y toma el control si lo necesitas. Para continuar con nuevos encargos, detén este escritorio y abre uno nuevo.</p>}
    {activity?.detail && <div className={styles.progress}>
      {activity.detail.connections.length > 0 && <p>Aplicaciones de este escritorio: <strong>{activity.detail.connections.map(computerConnectionLabel).join(" · ")}</strong></p>}
      {activity.detail.step && <p className={styles.step}>{activity.detail.step.label}{Number.isFinite(Date.parse(activity.detail.step.at)) && <time dateTime={activity.detail.step.at}>{new Date(activity.detail.step.at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</time>}</p>}
    </div>}
    {activity?.verifiedFiles?.length ? <VerifiedComputerFiles files={activity.verifiedFiles} /> : null}
    {visibleFrame && <div className={styles.screen}>
      <span className={styles.live}>Vista en directo</span>
      <Image src={visibleFrame.url} unoptimized width={1280} height={800} alt="Vista actual del escritorio privado de Altazor" />
    </div>}
  </section>;
}

/** Render only server-verified receipts. File text stays literal source data. */
export function VerifiedComputerFiles({ files }: { files: readonly VerifiedComputerFile[] }) {
  if (!files.length) return null;
  return <section className={styles.files} aria-label="Archivos descargados y verificados">
    <h3><FileCheck2 size={18} aria-hidden="true" />Descargas verificadas</h3>
    <ul>{files.map(file => <li key={`${file.requestId}:${file.sha256}`}>
      <p className={styles.fileName}>{file.name}</p>
      <p>{computerConnectionLabel(file.connector)} · {file.bytes.toLocaleString("es-CL")} bytes{file.pages !== undefined ? ` · ${file.pages} ${file.pages === 1 ? "página" : "páginas"}` : ""}</p>
      {file.firstLine !== undefined && <p className={styles.firstLine}><span>Primera línea del archivo</span><q>{file.firstLine}</q></p>}
      <details><summary>Origen y verificación</summary><dl>
        <dt>Archivo en el escritorio</dt><dd>{file.localPath}</dd>
        <dt>Origen</dt><dd>{file.kind === "google-workspace" ? `Google Drive · ${file.target.id}` : `${file.target.repo} · ${file.target.path}${file.target.ref ? ` · ${file.target.ref}` : ""}`}</dd>
        <dt>SHA-256</dt><dd>{file.sha256}</dd>
      </dl></details>
    </li>)}</ul>
  </section>;
}
