"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { apiMutation } from "@/lib/api-mutation";
import { newUiId } from "@/lib/ui-id";
import type { ResolvedCitation } from "@/lib/knowledge/citations";
import "./knowledge/knowledge.css";

type Matter = { id: string; titulo: string; rit?: string | null };
type Collection = { id: string; name: string; instructions: string; revision: number; causaId: string | null; siteId: string | null; scopeLabel: string; itemCount: number };
type Item = { id: string; available: false } | { id: string; available: true; citation: ResolvedCitation };
type Detail = Omit<Collection, "itemCount"> & { items: Item[]; limited: boolean };
const subscribe = () => () => {};
const interactive = () => true;
const server = () => false;
const changed = () => window.dispatchEvent(new Event("lexopen-library-changed"));

export function LibraryPanel({ initialCases = [] }: { initialCases?: Matter[] }) {
  const ready = useSyncExternalStore(subscribe, interactive, server);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reload, setReload] = useState(0);
  const [detailState, setDetailState] = useState<{ key: string; data: Detail | null }>({ key: "", data: null });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [scopeType, setScopeType] = useState<"general" | "case" | "site">("general");
  const [scopeId, setScopeId] = useState("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [cases, setCases] = useState(initialCases);
  const [sites, setSites] = useState<{id: string; name: string}[]>([]);
  const [edit, setEdit] = useState<{ id: string; revision: number; name: string; instructions: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const requestId = useRef("");
  const detailKey = `${selectedId}:${reload}`;
  const detail = detailState.key === detailKey ? detailState.data : null;

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/knowledge/collections", { cache: "no-store", signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo cargar la biblioteca"); return data; }).then(data => { if (!controller.signal.aborted) { setCollections(data.collections); if (data.limited) setStatus("Se muestran hasta 100 colecciones. Retire las que ya no use antes de crear otras."); } }).catch(e => { if (!controller.signal.aborted) { setCollections([]); setError(e.message); } });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    if (scopeType !== "site" || sites.length) return;
    const controller = new AbortController();
    void fetch("/api/research/scope", { cache: "no-store", signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudieron cargar los espacios"); return data; }).then(data => { if (!controller.signal.aborted) setSites(data.sites); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [scopeType, sites.length]);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void fetch(`/api/knowledge/collections/${selectedId}`, { cache: "no-store", signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo abrir la colección"); return data; }).then(data => { if (!controller.signal.aborted) { setDetailState({ key: detailKey, data }); setEdit({ id: data.id, revision: data.revision, name: data.name, instructions: data.instructions }); } }).catch(e => { if (!controller.signal.aborted) { setDetailState({ key: detailKey, data: null }); setError(e.message); } });
    return () => controller.abort();
  }, [selectedId, detailKey]);
  useEffect(() => { const refresh = () => { setReload(n => n + 1); }; window.addEventListener("lexopen-library-changed", refresh); return () => window.removeEventListener("lexopen-library-changed", refresh); }, []);

  async function create() {
    setBusy("create"); setError(""); setStatus("");
    if (!requestId.current) requestId.current = newUiId("collection");
    const response = await apiMutation<{ collection: Collection }>("/api/knowledge/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: requestId.current, name: newName, instructions: newNotes, ...(scopeType === "case" ? { causaId: scopeId } : scopeType === "site" ? { siteId: scopeId } : {}) }) });
    setBusy("");
    if (!response.ok) { setError(response.status === 0 ? "No se recibió la confirmación. Actualice la biblioteca o repita la misma solicitud antes de cambiar sus datos." : response.error); return; }
    setSelectedId(response.data.collection.id); setNewName(""); setNewNotes(""); requestId.current = ""; setStatus("Colección guardada."); changed();
  }
  async function save() {
    if (!detail || !edit) return;
    setBusy("edit"); setError("");
    const response = await apiMutation(`/api/knowledge/collections/${detail.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: edit.revision, name: edit.name, instructions: edit.instructions }) });
    setBusy(""); if (!response.ok) { setError(response.error); return; } setStatus("Nombre y notas guardados."); changed();
  }
  async function remove(itemId: string) {
    if (!detail) return;
    setBusy(itemId); setError("");
    const response = await apiMutation(`/api/knowledge/collections/${detail.id}/items/${itemId}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: detail.revision }) });
    setBusy(""); if (!response.ok) { setError(response.error); return; } setStatus("Versión retirada de esta colección. Su original sigue en la fuente."); changed();
  }
  async function removeCollection() {
    if (!detail) return;
    setBusy("delete"); setError("");
    const response = await apiMutation(`/api/knowledge/collections/${detail.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: detail.revision }) });
    setBusy(""); if (!response.ok) { setError(response.error); return; } setSelectedId(""); setConfirmDelete(false); setStatus("Colección eliminada; los originales se conservan."); changed();
  }
  async function findScope() {
    setBusy("scope"); setError("");
    try {
      const response = await fetch(scopeType === "case" ? `/api/causas?q=${encodeURIComponent(scopeFilter)}&limit=100` : `/api/research/scope?q=${encodeURIComponent(scopeFilter)}`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo buscar el ámbito");
      if (scopeType === "case") setCases(data); else setSites(data.sites);
      setScopeId(""); setStatus("Lista actualizada. Elija el expediente o espacio de la colección.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo buscar el ámbito"); } finally { setBusy(""); }
  }

  return <section id="biblioteca" className="source-library-panel space-y-5 border-y border-[var(--line)] py-6" aria-labelledby="library-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="library-title" className="display text-2xl">Mi biblioteca</h2><p className="mt-2 max-w-[75ch] text-sm text-[var(--ink-soft)]">Organice versiones verificadas para volver a consultarlas. Las colecciones son personales y conservan los permisos de cada fuente.</p></div><button type="button" className="btn btn-secondary" disabled={!ready || Boolean(busy)} onClick={() => { setReload(n => n + 1); setError(""); }}>Actualizar biblioteca</button></div>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    <p role="status" aria-live="polite" className="text-sm">{busy ? "Guardando o recuperando la biblioteca…" : status}</p>
    <details className="text-sm"><summary className="cursor-pointer font-medium text-[var(--sea)]">Crear una colección</summary><form method="post" className="mt-4 max-w-3xl space-y-4" onSubmit={e => { e.preventDefault(); void create(); }}><fieldset className="min-w-0 space-y-4" disabled={!ready || Boolean(busy)}>
      <div><label htmlFor="library-name" className="mb-2 block font-medium">Nombre de la colección</label><input id="library-name" className="input w-full" required minLength={3} maxLength={200} value={newName} onChange={e => setNewName(e.target.value)} /></div>
      <div><label htmlFor="library-scope" className="mb-2 block font-medium">Material que puede guardar</label><select id="library-scope" className="select w-full" value={scopeType} onChange={e => { setScopeType(e.target.value as typeof scopeType); setScopeId(""); }}><option value="general">Fuentes jurídicas públicas</option><option value="case">Fuentes de un expediente y fuentes públicas</option><option value="site">Archivos de un espacio y fuentes públicas</option></select></div>
      {scopeType !== "general" && <div className="space-y-2"><label htmlFor="library-scope-id" className="block font-medium">{scopeType === "case" ? "Expediente" : "Espacio"}</label><select id="library-scope-id" className="select w-full" required value={scopeId} onChange={e => setScopeId(e.target.value)}><option value="">Elija un ámbito autorizado</option>{scopeType === "case" ? cases.map(item => <option key={item.id} value={item.id}>{item.rit ? `${item.rit} · ` : ""}{item.titulo}</option>) : sites.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="flex flex-wrap gap-2"><label htmlFor="library-scope-filter" className="sr-only">Buscar expediente o espacio</label><input id="library-scope-filter" className="input min-w-0 flex-1" maxLength={100} placeholder="Buscar por nombre" value={scopeFilter} onChange={e => setScopeFilter(e.target.value)} /><button type="button" className="btn btn-secondary" onClick={() => void findScope()}>Buscar ámbito</button></div><p className="text-[var(--ink-soft)]">Hasta 100 coincidencias. El ámbito se conserva al crear la colección.</p></div>}
      <div><label htmlFor="library-notes" className="mb-2 block font-medium">Notas e instrucciones de trabajo</label><textarea id="library-notes" className="textarea w-full" rows={3} maxLength={4000} value={newNotes} onChange={e => setNewNotes(e.target.value)} /><p className="mt-1 text-[var(--ink-soft)]">Contexto manual para usted. No se ejecuta ni se envía a un modelo.</p></div><button className="btn btn-primary">Crear colección</button>
    </fieldset></form></details>
    <div><label htmlFor="library-collection" className="mb-2 block text-sm font-medium">Abrir colección</label><select id="library-collection" className="select w-full" disabled={!ready || Boolean(busy)} value={selectedId} onChange={e => { setSelectedId(e.target.value); setConfirmDelete(false); setError(""); }}><option value="">Elija una colección</option>{collections.map(collection => <option key={collection.id} value={collection.id}>{collection.name} · {collection.scopeLabel} · {collection.itemCount} versiones</option>)}</select></div>
    {!collections.length && <p className="max-w-[75ch] text-sm text-[var(--ink-soft)]">Aún no tiene colecciones accesibles. Cree una y use «Guardar en biblioteca» en un fragmento verificado para conservar su versión.</p>}
    {selectedId && !detail && !error && <p role="status" className="text-sm">Recuperando la colección y comprobando sus fuentes…</p>}
    {detail && <div className="space-y-5" data-testid="library-detail"><div><h3 className="break-words text-lg font-semibold">{detail.name}</h3><p className="mt-1 text-sm text-[var(--ink-soft)]">{detail.scopeLabel} · {detail.items.length} versiones guardadas. Agregar una versión nueva siempre requiere su elección.</p></div>
      <details className="text-sm"><summary className="cursor-pointer text-[var(--sea)]">Editar nombre y notas</summary>{edit?.id === detail.id && <form method="post" className="mt-3 max-w-3xl space-y-3" onSubmit={e => { e.preventDefault(); void save(); }}><fieldset className="min-w-0 space-y-3" disabled={!ready || Boolean(busy)}><label className="block">Nombre<input aria-label="Editar nombre de colección" className="input mt-1 w-full" required minLength={3} maxLength={200} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></label><label className="block">Notas e instrucciones<textarea aria-label="Editar notas de colección" className="textarea mt-1 w-full" rows={3} maxLength={4000} value={edit.instructions} onChange={e => setEdit({ ...edit, instructions: e.target.value })} /></label><button className="btn btn-secondary">Guardar nombre y notas</button></fieldset></form>}</details>
      {detail.instructions && <div className="max-w-[75ch] text-sm"><h4 className="font-medium">Notas manuales de esta colección</h4><p className="mt-2 whitespace-pre-wrap break-words">{detail.instructions}</p></div>}
      <ul className="divide-y divide-[var(--line)]">{detail.items.map(item => <li key={item.id} className="space-y-3 py-4">{item.available ? <><div className="flex flex-wrap items-start justify-between gap-3"><Link className="min-w-0 break-words font-medium text-[var(--sea)]" href={item.citation.href}>{item.citation.title}{item.citation.pageNumber ? ` · Página ${item.citation.pageNumber}` : ""}</Link><span className="text-sm text-[var(--ink-soft)]">{item.citation.isCurrent ? "Última captura guardada" : "Versión anterior conservada"}</span></div>{item.citation.acquisitionMethod === "manual" && <p className="text-sm font-medium">Aporte manual sin cotejo oficial</p>}{item.citation.warnings.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-[var(--sea)]">Procedencia y límites de esta versión</summary><ul className="mt-2 list-disc space-y-1 pl-5">{item.citation.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}{item.citation.extractionMethod === "ocr" && <p className="text-sm font-medium">OCR local · contraste la cita con la imagen de la página</p>}<blockquote className="source-quotation max-w-[75ch] whitespace-pre-wrap break-words text-sm leading-relaxed">{item.citation.quote}</blockquote>{item.citation.partial && <p className="text-sm">Esta versión tiene extracción parcial.</p>}<Link className="inline-block text-sm text-[var(--sea)]" href={item.citation.href}>Abrir cita y versión</Link></> : <p className="text-sm">Fuente no disponible o sin acceso actual. Su contenido quedó fuera de la consulta.</p>}<div><button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => void remove(item.id)} aria-label={item.available ? `Retirar ${item.citation.title} de la colección` : "Retirar fuente no disponible"}>Retirar de la colección</button></div></li>)}</ul>
      {!detail.items.length && <p className="text-sm text-[var(--ink-soft)]">Colección vacía. Abra una fuente y guarde un fragmento verificado para añadir su versión.</p>}
      <p className="text-sm text-[var(--ink-soft)]">Hasta 200 versiones por colección. Para usarlas en otra consulta, seleccione esta colección en Investigación. Retirar una entrada no elimina el original; las consultas guardadas que la usaron dejan de recuperarse.</p>
      <div className="flex flex-wrap gap-2">{confirmDelete ? <><p className="w-full text-sm">Se eliminarán la colección y sus notas. Los documentos originales se conservan.</p><button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => void removeCollection()}>Confirmar eliminación de colección</button><button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Conservar colección</button></> : <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => setConfirmDelete(true)}>Eliminar colección</button>}</div>
    </div>}
  </section>;
}
