"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Search, X } from "lucide-react";
import type { AltazorSourceInput } from "@/lib/altazor/resource-input";
type Candidate = { input: AltazorSourceInput; title: string; text: string; review: string; href: string };
type Catalog = { books: { id: string; title: string }[]; candidates: Candidate[]; limited: boolean; nextAfter: string | null; coverage?: { scope: string } };
export type AltazorSelectedSource = Candidate;
const key = (input: AltazorSourceInput) => JSON.stringify(input);
export function AltazorSources({ causaId, selected, onChange, refreshKey }: { causaId?: string | null; selected: AltazorSelectedSource[]; onChange: (sources: AltazorSelectedSource[]) => void; refreshKey?: string }) {
  const [kind, setKind] = useState("book"), [bookId, setBookId] = useState(""), [q, setQ] = useState(""), [query, setQuery] = useState(""), [catalog, setCatalog] = useState<Catalog | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [after, setAfter] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController(), params = new URLSearchParams({ kind, q: query });
    if (after) params.set("after", after);
    if (causaId) params.set("causaId", causaId);
    if (bookId && kind === "book") params.set("bookId", bookId);
    void fetch(`/api/altazor/resources?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudieron consultar los respaldos"); return data; })
      .then(data => { if (!controller.signal.aborted) { setCatalog(data); setError(""); setLoading(false); } })
      .catch(error => { if (!controller.signal.aborted) { setError(error instanceof Error ? error.message : "No se pudo cargar la selección"); setLoading(false); } });
    return () => controller.abort();
  }, [causaId, kind, bookId, query, after, refresh, refreshKey]);
  return <section className="altazor-sources" aria-label="Fuentes para ALTAZOR">
    <div className="altazor-section-heading"><h3>Fuentes elegidas <span>{selected.length}/8</span></h3><Link href="/biblioteca"><BookOpen size={16} /> Abrir biblioteca</Link></div>
    {selected.length > 0 && <ul className="altazor-selection">{selected.map((source, index) => <li key={key(source.input)}><span>R{index+1} · {source.title}</span><button type="button" onClick={() => onChange(selected.filter((_, position) => position !== index))} aria-label={`Retirar ${source.title}`}><X size={16} /></button></li>)}</ul>}
    <div className="altazor-source-filters">
      {causaId && <label>Tipo de respaldo<select value={kind} onChange={event => { setLoading(true); setKind(event.target.value); setQuery(""); setBookId(""); setAfter(""); }}><option value="book">Biblioteca</option><option value="fact">Hechos de la causa</option><option value="note">Notas de audiencia</option></select></label>}
      {kind === "book" && <label>Libro<select value={bookId} onChange={event => { setLoading(true); setBookId(event.target.value); setAfter(""); }}><option value="">Selecciona un libro</option>{catalog?.books.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label>}
      <label>Buscar pasaje<input value={q} onChange={event => setQ(event.target.value)} maxLength={100} placeholder="Una palabra o frase" /></label>
      <button type="button" className="btn btn-outline" onClick={() => { setLoading(true); setQuery(q); setAfter(""); setRefresh(value => value + 1); }}><Search size={16} /> Buscar</button>
    </div>
    {error && <p role="alert" className="altazor-error">{error}</p>}
    {loading ? <p role="status">Consultando tus fuentes…</p> : <ul className="altazor-source-results">{catalog?.candidates.map(source => {
      const checked = selected.some(item => key(item.input) === key(source.input));
      return <li key={key(source.input)}><label><input type="checkbox" checked={checked} disabled={!checked && selected.length >= 8} onChange={() => onChange(checked ? selected.filter(item => key(item.input) !== key(source.input)) : [...selected, source])} /><span><strong>{source.title}</strong><span className="altazor-source-quote">{source.text}</span><small>{source.review}</small></span></label></li>;
    })}</ul>}
    {!loading && catalog?.candidates.length === 0 && <p className="altazor-muted">{kind === "book" && !bookId ? "Elige un libro para consultar sus pasajes preparados." : "No hay pasajes disponibles en esta ventana. Puedes revisar el origen en su apartado."}</p>}
    {!loading && catalog?.nextAfter && <button type="button" className="btn btn-outline" onClick={() => { setLoading(true); setAfter(catalog.nextAfter!); }}>Siguientes pasajes</button>}
    <p className="altazor-muted">{catalog?.coverage?.scope} Las fuentes se vuelven a cotejar al enviar la consulta.</p>
  </section>;
}
