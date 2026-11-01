"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
import type { CitationInput } from "@/lib/knowledge/citations";
type Collection = { id: string; name: string; revision: number; causaId: string | null; siteId: string | null; scopeLabel: string };
export function BookmarkCitationButton({ citation, causaId, siteId }: { citation: CitationInput; causaId?: string | null; siteId?: string | null }) {
  const id = useId();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]), [selected, setSelected] = useState("");
  async function load() {
    setOpen(true); setBusy(true); setError(""); setMessage("");
    try { const verified = await apiMutation<{causaId: string | null; siteId: string | null}>("/api/knowledge/citations/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ citation, ...(causaId ? { causaId } : {}) }) }); if (!verified.ok) throw new Error(verified.error); const sourceCase = verified.data.causaId || causaId, sourceSite = verified.data.siteId || siteId; const response = await fetch("/api/knowledge/collections", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo abrir la biblioteca"); const choices = (data.collections as Collection[]).filter(c => citation.kind === "legal" || Boolean(sourceCase && c.causaId === sourceCase) || Boolean(sourceSite && c.siteId === sourceSite)); setCollections(choices); setSelected(previous => choices.some(c => c.id === previous) ? previous : choices[0]?.id || ""); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo abrir la biblioteca"); }
    finally { setBusy(false); }
  }
  async function save() {
    const collection = collections.find(c => c.id === selected); if (!collection) return;
    setBusy(true); setError("");
    const response = await apiMutation<{ reused: boolean }>(`/api/knowledge/collections/${collection.id}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ citation, expectedRevision: collection.revision }) });
    setBusy(false);
    if (!response.ok) { setError(response.error); return; }
    setOpen(false); setMessage(response.data.reused ? "Esta versión ya estaba en la colección; se conservó la referencia guardada." : "Versión y cita guardadas en su biblioteca."); window.dispatchEvent(new Event("lexopen-library-changed"));
  }
  return <div className="space-y-2"><button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => { if (open) setOpen(false); else void load(); }}>Guardar en biblioteca</button>
    {open && <div className="space-y-3 rounded-xl border border-[var(--line)] p-4"><p className="text-sm text-[var(--ink-soft)]">Se guarda esta versión. No se amplían los permisos de su fuente ni se sustituye por versiones posteriores.</p>{busy ? <p role="status" className="text-sm">Comprobando colecciones…</p> : collections.length ? <><label htmlFor={id} className="block text-sm font-medium">Colección de destino</label><select id={id} className="select w-full" value={selected} onChange={e => setSelected(e.target.value)}>{collections.map(c => <option key={c.id} value={c.id}>{c.name} · {c.scopeLabel}</option>)}</select><button type="button" className="btn btn-secondary" disabled={!selected || busy} onClick={save}>Conservar esta versión</button></> : <p className="text-sm">No tiene colecciones compatibles con esta fuente. Cree una colección de la causa o del espacio; las generales admiten fuentes jurídicas públicas.</p>}<div className="flex flex-wrap gap-3"><Link href="/jurisprudencia#biblioteca" className="text-sm text-[var(--sea)] underline">Abrir mi biblioteca</Link><button type="button" className="text-sm text-[var(--sea)] underline" disabled={busy} onClick={load}>Actualizar colecciones</button></div></div>}
    {message && <p role="status" className="text-sm">{message}</p>}{error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
  </div>;
}
