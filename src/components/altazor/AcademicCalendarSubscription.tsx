"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { isCalendarSubscriptionPath } from "@/lib/altazor/calendar-feed-policy";
import { withCsrfHeaders } from "@/lib/client-csrf";
import { SANTIAGO_TZ } from "@/lib/chile-time";
import styles from "./AcademicTeaching.module.css";

type FeedStatus = { enabled: boolean; enabledAt: string | null; path?: string };
type FeedAction = "enable" | "renew" | "revoke";

const date = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: SANTIAGO_TZ });
const actionCopy: Record<FeedAction, { label: string; description: string }> = {
  enable: {
    label: "Generar enlace",
    description: "Quien tenga el enlace podrá leer los títulos y horarios de las actividades actuales y futuras de este trabajo. Compártelo sólo con el calendario que quieres suscribir.",
  },
  renew: {
    label: "Reemplazar enlace",
    description: "El enlace anterior dejará de actualizarse. Tendrás que suscribir el nuevo enlace en cada calendario que quieras mantener al día.",
  },
  revoke: {
    label: "Revocar enlace",
    description: "El enlace dejará de dar acceso a la Agenda. Los calendarios externos pueden conservar una copia de lo que ya consultaron.",
  },
};

async function readFeedStatus(endpoint: string, signal: AbortSignal, method: "GET" | "POST" | "DELETE" = "GET") {
  const response = await fetch(endpoint, {
    method, signal, cache: "no-store",
    headers: method === "GET" ? undefined : withCsrfHeaders(),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.enabled !== "boolean") {
    throw new Error(typeof result?.error === "string" ? result.error : "No se pudo consultar el enlace. Inténtalo de nuevo.");
  }
  return result as FeedStatus;
}

function CalendarFeedControls({ endpoint }: { endpoint: string }) {
  const [status, setStatus] = useState<FeedStatus | null>(null);
  const [pending, setPending] = useState<FeedAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [url, setUrl] = useState("");
  const operation = useRef<AbortController | null>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const primaryAction = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const { hostname, protocol, origin } = window.location;
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  const available = protocol === "https:" || protocol === "http:" && loopback;

  useEffect(() => {
    const controller = new AbortController();
    void readFeedStatus(endpoint, controller.signal).then(result => {
      if (!controller.signal.aborted) setStatus({ enabled: result.enabled, enabledAt: result.enabledAt });
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudo comprobar el enlace.");
    });
    return () => {
      controller.abort();
      operation.current?.abort();
      operation.current = null;
    };
  }, [endpoint, attempt]);

  useEffect(() => {
    if (url) urlInput.current?.focus();
  }, [url]);

  useEffect(() => {
    if (pending) confirmation.current?.focus();
  }, [pending]);

  async function confirm(action: FeedAction) {
    if (operation.current || action !== "revoke" && !available) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    setUrl("");
    try {
      const result = await readFeedStatus(endpoint, controller.signal, action === "revoke" ? "DELETE" : "POST");
      if (controller.signal.aborted) return;
      setStatus({ enabled: result.enabled, enabledAt: result.enabledAt });
      setPending(null);
      if (action === "revoke") {
        setNotice("Enlace revocado.");
        requestAnimationFrame(() => primaryAction.current?.focus());
        return;
      }
      if (!result.path || !isCalendarSubscriptionPath(result.path)) {
        setError("No se pudo mostrar el enlace. Genera uno nuevo para volver a intentarlo.");
        return;
      }
      setUrl(new URL(result.path, origin).href);
      setNotice("El enlace está listo para copiar.");
    } catch (reason) {
      if (!controller.signal.aborted) {
        setStatus(null);
        setPending(null);
        setError(reason instanceof Error ? reason.message : "No se pudo confirmar el cambio. Revisa el estado del enlace.");
      }
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setBusy(false);
      }
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Enlace copiado.");
    } catch {
      urlInput.current?.focus();
      urlInput.current?.select();
      setNotice("Copia el enlace seleccionado desde el campo.");
    }
  }

  function requestConfirmation(action: FeedAction) {
    setPending(action);
    setNotice("");
  }

  return <div className={styles.feedControls}>
    <p className={styles.meta}>Añade el enlace como una suscripción de sólo lectura. El calendario externo consulta los cambios cuando se actualiza y debe poder acceder a LexOpen por HTTPS.</p>
    {loopback && <p className={styles.meta}>Esta dirección sólo funciona en este equipo. Para usar un calendario en línea, abre LexOpen desde una dirección HTTPS que el calendario pueda alcanzar.</p>}
    {!available && <p className={styles.meta}>Abre LexOpen por HTTPS para generar un enlace.</p>}
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    {notice && <p role="status" className="text-sm text-[var(--sea)]">{notice}</p>}
    {!status ? error
      ? <Button type="button" variant="secondary" className="justify-self-start" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Revisar estado del enlace</Button>
      : <p role="status" className={styles.meta}>Comprobando la suscripción…</p>
      : <>
        <p className={styles.feedStatus}>
          {status.enabled ? <>Enlace activo{status.enabledAt && <> desde el <time dateTime={status.enabledAt}>{date.format(new Date(status.enabledAt))}</time></>}</> : "Suscripción desactivada"}
        </p>
        {url && <div className={styles.feedControls}>
          <label>Enlace para suscribirse
            <input ref={urlInput} className="input min-w-0 w-full" type="text" value={url} readOnly spellCheck={false} autoComplete="off" onFocus={event => event.currentTarget.select()} />
          </label>
          <p className={styles.meta}>Cópialo antes de cerrar. LexOpen lo muestra sólo al generarlo.</p>
          <div className={styles.actions}>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void copy()}><Copy size={16} aria-hidden="true" />Copiar enlace</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { setUrl(""); setNotice(""); requestAnimationFrame(() => primaryAction.current?.focus()); }}>Ocultar enlace</Button>
          </div>
        </div>}
        {!url && status.enabled && <p className={styles.meta}>Si perdiste el enlace, puedes generar uno nuevo.</p>}
        {!pending && <div className={styles.actions}>
          <button ref={primaryAction} type="button" className="btn btn-outline" disabled={!available || busy}
            onClick={() => requestConfirmation(status.enabled ? "renew" : "enable")}>{status.enabled ? "Generar otro enlace" : "Activar suscripción"}</button>
          {status.enabled && <Button type="button" variant="ghost" disabled={busy} onClick={() => requestConfirmation("revoke")}>Revocar suscripción</Button>}
        </div>}
        {pending && <div ref={confirmation} tabIndex={-1} className={styles.feedConfirmation} role="group" aria-label="Confirmar cambio de suscripción">
          <p className={styles.meta}>{actionCopy[pending].description}</p>
          <div className={styles.actions}>
            <Button type="button" variant={pending === "revoke" ? "danger" : "primary"} loading={busy} onClick={() => void confirm(pending)}>{actionCopy[pending].label}</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { setPending(null); requestAnimationFrame(() => primaryAction.current?.focus()); }}>Cancelar</Button>
          </div>
        </div>}
      </>}
  </div>;
}

export function AcademicCalendarSubscription({ workspaceId }: { workspaceId: string }) {
  const [expanded, setExpanded] = useState(false);
  const endpoint = `/api/altazor/academic/${encodeURIComponent(workspaceId)}/calendar-feed`;
  return <details className={styles.calendarFeed} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary><Link2 size={17} aria-hidden="true" /> Suscribir otro calendario</summary>
    {expanded && <CalendarFeedControls endpoint={endpoint} key={endpoint} />}
  </details>;
}
