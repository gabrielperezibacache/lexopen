"use client";
import { useEffect, useRef, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
import type { PjudSearchResult } from "@/lib/research/pjud-search";
export function PjudJudgmentSearch({ onSelect, disabled }: { onSelect: (url: string) => void; disabled: boolean }) {
  const [terms, setTerms] = useState("");
  const [rol, setRol] = useState("");
  const [result, setResult] = useState<PjudSearchResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  function invalidate() { active.current?.abort(); active.current = null; setBusy(false); setResult(null); setError(""); }
  async function search(page = 0) {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(""); setResult(null);
    const response = await apiMutation<PjudSearchResult>("/api/research/pjud", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terms, rol, page }) });
    if (active.current !== controller || controller.signal.aborted) return;
    active.current = null; setBusy(false);
    if (!response.ok) { setError(response.error); return; }
    setResult(response.data);
  }
  return <section className="space-y-4" aria-labelledby="pjud-search-title">
    <h3 id="pjud-search-title" className="text-lg font-semibold">Buscar fallos civiles en el Poder Judicial</h3>
    <p className="text-sm">Esta búsqueda envía únicamente los términos y el ROL que escriba aquí al portal público. No incluye su expediente ni su consulta local.</p>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); void search(); }}>
      <label className="block text-sm">Términos públicos<input className="input w-full" maxLength={200} value={terms} onChange={e => { invalidate(); setTerms(e.target.value); }} /></label>
      <label className="block text-sm">ROL (número o número y año)<input className="input w-full" maxLength={25} placeholder="3630 o C-3630-2023" value={rol} onChange={e => { invalidate(); setRol(e.target.value); }} /></label>
      <button className="btn btn-secondary" disabled={disabled || busy || (terms.trim().length < 3 && !rol.trim())} aria-busy={busy}>{busy ? "Consultando portal…" : "Buscar en PJUD"}</button>
      {busy && <button type="button" className="btn btn-ghost" onClick={invalidate}>Cancelar</button>}
    </form>
    {error && <p role="alert">{error}</p>}
    {result && <div className="space-y-3" aria-live="polite"><p>Página {result.page + 1} · Total declarado por el portal: {result.totalReported}</p>{result.warnings.map(w => <p key={w} className="text-sm">{w}</p>)}{!result.items.length && <p>No se recibieron resultados en esta página.</p>}
      <ul className="space-y-3">{result.items.map(item => <li key={item.id}><p className="font-medium">{item.rol || item.id} · {item.title}</p><p className="text-sm">{item.tribunal}</p><button type="button" className="btn btn-ghost" disabled={disabled || busy} onClick={() => onSelect(item.importUrl)}>Preparar incorporación del fallo {item.id}</button></li>)}</ul>
      <div className="flex gap-3">{result.page > 0 && <button type="button" className="btn btn-secondary" disabled={disabled || busy} onClick={() => void search(result.page - 1)}>Anterior</button>}{result.nextPage !== null && <button type="button" className="btn btn-secondary" disabled={disabled || busy} onClick={() => void search(result.nextPage!)}>Siguiente</button>}</div>
    </div>}
  </section>;
}
