"use client";

import { useEffect, useRef, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
import { Copy, Download, Search } from "lucide-react";
import { PdfEvidencePagePreview } from "./PdfEvidencePagePreview";

type Evidence = {
  document: { id: string; name: string; status: string | null };
  versions: { id: string; sourceName: string; sourceSha256: string; createdAt: string; partial: boolean; pageCount: number | null; locatorKind: string; _count: { fragments: number } }[];
  selectedVersionId: string | null;
  fragments: { id: string; ordinal: number; text: string; href: string; pageNumber?: number | null }[];
  pages: { pageNumber: number; method: string; status: string; reason?: string | null }[];
  selectedPageNumber: number | null;
  nextAfter: number | null;
  versionHistoryLimited: boolean;
};

export function DocumentEvidenceReader({ documentId, initialVersion = "", initialAfter = 0, initialPage }: { documentId: string; initialVersion?: string; initialAfter?: number; initialPage?: number }) {
  const [response, setResponse] = useState<{ key: string; data: Evidence | null; error?: string } | null>(null);
  const [version, setVersion] = useState(initialVersion);
  const [after, setAfter] = useState(initialAfter);
  const [page, setPage] = useState(initialPage);
  const [query, setQuery] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [refresh, setRefresh] = useState(0);

  const [preparing, setPreparing] = useState(false);
  const [localError, setError] = useState("");
  const [status, setStatus] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const copyRef = useRef<HTMLTextAreaElement>(null);
  const requestKey = JSON.stringify([documentId, version, after, query, refresh, page]);
  const data = response?.key === requestKey ? response.data : null;
  const loading = response?.key !== requestKey;
  const error = localError || (response?.key === requestKey ? response.error : "");

  useEffect(() => {
    const controller = new AbortController();
    const sp = new URLSearchParams();
    if (version) sp.set("version", version);
    if (after) sp.set("after", String(after));
    if (query) sp.set("q", query);
    if (page) sp.set("page", String(page));
    fetch(`/api/documentos/${documentId}/evidence?${sp}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "No se pudieron cargar las fuentes");
        return result as Evidence;
      })
      .then(result => { if (!controller.signal.aborted) setResponse({ key: requestKey, data: result }); })
      .catch(e => { if (!controller.signal.aborted) setResponse({ key: requestKey, data: null, error: e.message || "No se pudieron cargar las fuentes" }); });
    return () => controller.abort();
  }, [documentId, version, after, query, refresh, requestKey, page]);

  useEffect(() => {
    if (manualCopy) { copyRef.current?.focus(); copyRef.current?.select(); }
  }, [manualCopy]);
  useEffect(() => {
    if (data && !loading && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [data, loading]);

  async function prepare() {
    setPreparing(true); setError(""); setStatus("");
    const result = await apiMutation<{ id: string }>(`/api/documentos/${documentId}/evidence`, { method: "POST" });
    setPreparing(false);
    if (!result.ok) { setError(result.error); return; }
    setVersion(result.data.id); setAfter(0); setPage(undefined); setRefresh(n => n + 1); setStatus("La versión y sus fragmentos están registrados.");
  }
  async function copy(fragment: Evidence["fragments"][number]) {
    if (!data) return;
    const verification = await apiMutation<{ verified: boolean }>(`/api/evidence/fragments/${fragment.id}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote: fragment.text }) });
    if (!verification.ok || !verification.data.verified) { setError(verification.ok ? "El fragmento no coincide con el texto registrado. Vuelva a cargar sus fuentes." : verification.error); return; }
    const selected = data.versions.find(v => v.id === data.selectedVersionId);
    const reference = `“${fragment.text}”\n${data.document.name}${fragment.pageNumber ? ` · Página ${fragment.pageNumber}` : ""} · Fragmento ${fragment.ordinal} · versión ${selected ? new Date(selected.createdAt).toLocaleString("es-CL") : "registrada"}\n${new URL(fragment.href, window.location.origin).href}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard-unavailable");
      await navigator.clipboard.writeText(reference); setStatus(`Referencia del fragmento ${fragment.ordinal} copiada.`);
    } catch { setManualCopy(reference); }
  }
  const selected = data?.versions.find(v => v.id === data.selectedVersionId);
  const processing = ["pending", "processing"].includes(data?.document.status || "");
  const selectedPage = data?.pages.find(p => p.pageNumber === data.selectedPageNumber);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-1">
        <label htmlFor="evidence-version" className="mb-1 block text-sm font-medium">Versión consultada</label>
        <select id="evidence-version" className="select w-full sm:max-w-xl" disabled={!data?.versions.length || loading} value={data?.selectedVersionId || ""} onChange={e => { setVersion(e.target.value); setAfter(0); setPage(undefined); }}>
          {!data?.versions.length && <option value="">Sin fuentes preparadas</option>}
          {data?.versions.map(v => <option key={v.id} value={v.id}>{new Date(v.createdAt).toLocaleString("es-CL")} · {v._count.fragments} fragmentos</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        {selected && <a href={`/api/evidence/versions/${selected.id}/original`} className="btn btn-secondary"><Download size={16} aria-hidden="true" />Original de esta versión</a>}
        <button type="button" className="btn btn-primary" disabled={preparing || processing || loading} aria-busy={preparing} onClick={prepare}>{preparing ? "Preparando…" : data?.versions.length ? "Preparar versión actual" : "Preparar fuentes"}</button>
      </div>
    </div>
    {processing && <p className="text-sm text-[var(--ink)]">El documento sigue en procesamiento. Sus fuentes estarán disponibles al finalizar.</p>}
    {selected?.partial && <p className="text-sm text-[var(--ink)]"><strong>Extracción incompleta.</strong> Hay páginas pendientes, fallidas o fuera del límite de procesamiento. Los fragmentos representan el texto disponible.{selected.pageCount && data ? ` Páginas registradas: ${data.pages.length} de ${selected.pageCount}.` : ""}</p>}
    <p className="text-sm text-[var(--ink-soft)]">{selected?.locatorKind === "pdf-page" ? "Cada fragmento pertenece a una página física del PDF. Contraste el texto extraído con la imagen del original; el OCR puede contener errores." : "Los fragmentos conservan su texto y versión. Su numeración no representa páginas del PDF."}</p>
    {data && selected && data.pages.length > 0 && <div className="space-y-4">
      <label className="block text-sm font-medium" htmlFor="evidence-page">Página del PDF</label>
      <select className="select w-full sm:max-w-md" id="evidence-page" value={data.selectedPageNumber || 1} onChange={e => { setPage(Number(e.target.value)); setAfter(0); }}>
        {data.pages.map(p => <option key={p.pageNumber} value={p.pageNumber}>Página {p.pageNumber} · {p.method === "native" ? "Texto nativo" : p.method === "ocr" ? "OCR local" : p.status === "empty" ? "Sin texto" : "Extracción pendiente"}</option>)}
      </select>
      {selectedPage && !["completed", "empty"].includes(selectedPage.status) && <p role="status" className="text-sm">Esta página requiere procesamiento: {selectedPage.reason || selectedPage.status}.</p>}
      <details className="border-y border-[var(--line)] py-4" open><summary className="cursor-pointer font-medium">Contrastar página {data.selectedPageNumber}</summary><div className="mt-4 max-w-3xl"><PdfEvidencePagePreview versionId={selected.id} pageNumber={data.selectedPageNumber || 1} name={data.document.name} /></div></details>
    </div>}
    <div role="status" aria-live="polite" className="text-sm text-[var(--ink)]">{loading ? "Cargando fuentes…" : status}</div>
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-[var(--danger)]"><span>{error}</span><button type="button" className="btn btn-secondary" onClick={() => { setError(""); setRefresh(n => n + 1); }}>Volver a cargar</button></div>}
    {manualCopy && <div><label htmlFor="evidence-copy" className="mb-1 block text-sm font-medium">Copie esta referencia</label><textarea id="evidence-copy" ref={copyRef} readOnly className="textarea w-full" value={manualCopy} rows={3} /><button type="button" className="btn btn-ghost mt-2" onClick={() => setManualCopy("")}>Cerrar referencia</button></div>}
    {data && selected && <>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={e => { e.preventDefault(); setQuery(draftQuery.trim()); setAfter(0); }}>
        <label htmlFor="evidence-search" className="sr-only">Buscar en los fragmentos</label>
        <input id="evidence-search" type="search" className="input min-w-0 flex-1 placeholder:text-[var(--ink-soft)] placeholder:opacity-100" maxLength={200} value={draftQuery} onChange={e => setDraftQuery(e.target.value)} placeholder="Buscar en el texto de esta versión" />
        <button className="btn btn-secondary" disabled={loading}><Search size={16} aria-hidden="true" />Buscar en texto</button>
      </form>
      <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]" aria-busy={loading}>
        {!data.fragments.length && !loading && <p className="py-8 text-sm">{selectedPage?.status === "empty" ? "Esta página no contiene texto ni imágenes que requieran OCR." : selectedPage && selectedPage.status !== "completed" ? "Esta página todavía no tiene texto verificable. Consulte la imagen y reintente preparar las fuentes cuando el procesamiento esté disponible." : "No hay fragmentos para esta búsqueda. Pruebe otra palabra o quite el filtro."}</p>}
        {data.fragments.map(fragment => <section id={`fragment-${fragment.ordinal}`} key={fragment.id} className="scroll-mt-24 py-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Fragmento {fragment.ordinal}{fragment.pageNumber ? ` · Página ${fragment.pageNumber}` : ""}</h2><button type="button" className="btn btn-ghost text-sm" onClick={() => copy(fragment)} aria-label={`Copiar referencia del fragmento ${fragment.ordinal}`}><Copy size={16} aria-hidden="true" />Copiar referencia</button></div>
          <p className="max-w-[75ch] whitespace-pre-wrap break-words text-[var(--ink)] leading-relaxed">{fragment.text}</p>
        </section>)}
      </div>
      <div className="flex flex-wrap gap-2">{after > 0 && <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => setAfter(0)}>Primeros fragmentos</button>}{data.nextAfter !== null && <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => setAfter(data.nextAfter!)}>Siguientes fragmentos</button>}</div>
      <details className="text-sm"><summary className="cursor-pointer font-medium">Identificación del original</summary><p className="mt-2 break-all text-[var(--ink-soft)]">SHA-256: {selected.sourceSha256}</p></details>
      {data.versionHistoryLimited && <p className="text-sm">Se muestran las versiones más recientes. Las referencias antiguas siguen abriendo su versión registrada.</p>}
    </>}
    {data && !selected && !loading && <div className="panel rounded-2xl p-6"><h2 className="text-lg font-semibold">Este documento aún no tiene fragmentos registrados</h2><p className="mt-2 max-w-2xl text-sm text-[var(--ink-soft)]">Prepare sus fuentes para conservar referencias al texto consultado. El archivo original permanece disponible.</p></div>}
  </div>;
}
