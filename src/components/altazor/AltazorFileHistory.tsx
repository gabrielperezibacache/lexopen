"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { FileHistoryPage } from "@/lib/altazor/computer/file-history-types";
import styles from "./AltazorFileHistory.module.css";

const labels = { confirmed: "Confirmada", failed: "Fallida o rechazada", unknown: "Sin confirmar" };
const connectionLabel = (alias: string) => `${alias.startsWith("altazor-google-") ? "Google Drive" : alias.startsWith("altazor-github-") ? "GitHub" : "Dropbox"} · ${alias.slice(-4)}`;
type Filters = { status: string; connector: string; from: string; to: string };
const emptyFilters: Filters = { status: "", connector: "", from: "", to: "" };
export function AltazorFileHistory({ causaId }: { causaId: string | null }) {
  const uid = useId(), request = useRef<AbortController | null>(null), epoch = useRef(0);
  const [open, setOpen] = useState(false), [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState<FileHistoryPage | null>(null), [connectors, setConnectors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [positions, setPositions] = useState<Array<string | null>>([null]);
  useEffect(() => () => { epoch.current++; request.current?.abort(); }, []);
  async function load(next: Array<string | null>, selected = filters) {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const version = ++epoch.current;
    const timeout = window.setTimeout(() => controller.abort("timeout"), 20_000);
    setBusy(true); setError(""); setPage(null);
    const query = new URLSearchParams();
    if (causaId) query.set("causaId", causaId);
    for (const [key, value] of Object.entries(selected)) if (value) query.set(key, value);
    const cursor = next.at(-1); if (cursor) query.set("cursor", cursor);
    try {
      const response = await fetch(`/api/altazor/computer/files/history?${query}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (version !== epoch.current) return;
      if (!response.ok) { setConnectors([]); throw new Error("No se pudo consultar el historial. Compruebe su acceso y vuelva a cargar."); }
      setPage(result as FileHistoryPage); setConnectors((result as FileHistoryPage).connectors); setPositions(next);
    } catch (failure) {
      if (version === epoch.current && (!controller.signal.aborted || controller.signal.reason === "timeout")) setError(failure instanceof Error ? failure.message : "No se pudo consultar el historial.");
    } finally { window.clearTimeout(timeout); if (version === epoch.current) setBusy(false); }
  }
  function toggle(next: boolean) {
    setOpen(next);
    if (next) void load([null]);
    else { epoch.current++; request.current?.abort(); setBusy(false); setPage(null); setConnectors([]); setError(""); }
  }
  return <details className={styles.root} onToggle={event => toggle(event.currentTarget.open)}>
    <summary>Historial de descargas</summary>
    {open && <section aria-label="Recibos históricos de descargas" aria-busy={busy}>
      <p>Fechas de solicitud, hora de Chile. Los recibos reflejan la confirmación registrada; la disponibilidad actual del archivo se comprueba en el escritorio.</p>
      <form className={styles.filters} onSubmit={event => { event.preventDefault(); void load([null]); }}>
        <label htmlFor={`${uid}-state`}>Estado<select id={`${uid}-state`} className="input" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">Todos</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label htmlFor={`${uid}-connection`}>Conexión<select id={`${uid}-connection`} className="input" value={filters.connector} onChange={event => setFilters({ ...filters, connector: event.target.value })}><option value="">Todas</option>{connectors.map(name => <option key={name} value={name}>{connectionLabel(name)}</option>)}</select></label>
        <label htmlFor={`${uid}-from`}>Desde<input id={`${uid}-from`} className="input" type="date" value={filters.from} max={filters.to || undefined} onChange={event => setFilters({ ...filters, from: event.target.value })} /></label>
        <label htmlFor={`${uid}-to`}>Hasta<input id={`${uid}-to`} className="input" type="date" value={filters.to} min={filters.from || undefined} onChange={event => setFilters({ ...filters, to: event.target.value })} /></label>
        <button className="btn btn-secondary" type="submit" disabled={busy}>Consultar</button>
      </form>
      {busy && <p role="status">Consultando recibos…</p>}
      {error && <p role="alert">{error}</p>}
      {page && <>
        {page.items.length > 0 ? <ul className={styles.list}>{page.items.map(item => <li key={item.id} data-state={item.status}>
          <div><strong>{item.name}</strong><span>{labels[item.status]}</span></div>
          <p>{connectionLabel(item.connector)} · <time dateTime={item.at}>{new Date(item.at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}</time></p>
          {item.bytes !== undefined && <p>{item.bytes.toLocaleString("es-CL")} bytes{item.pages === undefined ? "" : ` · ${item.pages} ${item.pages === 1 ? "página" : "páginas"}`}</p>}
          {item.status === "unknown" && <p>La confirmación está pendiente o no se conservó un recibo completo.</p>}
        </li>)}</ul> : <p role="status">{page.nextCursor ? "No hay coincidencias en esta página. Puede continuar a la siguiente." : "No hay descargas que coincidan en esta página."}</p>}
        <nav className={styles.pagination} aria-label="Páginas del historial de descargas"><button className="btn btn-ghost" type="button" disabled={busy || positions.length < 2} onClick={() => void load(positions.slice(0, -1))}>Anterior</button><span>Página {positions.length}</span><button className="btn btn-ghost" type="button" disabled={busy || !page.nextCursor} onClick={() => void load([...positions, page.nextCursor])}>Siguiente</button></nav>
      </>}
    </section>}
  </details>;
}
