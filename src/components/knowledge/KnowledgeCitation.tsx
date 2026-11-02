"use client";
import { useId, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
import type { ResolvedCitation } from "@/lib/knowledge/citations";
import { BookmarkCitationButton } from "./BookmarkCitationButton";
import "./knowledge.css";
export function KnowledgeCitation({ citation, causaId }: { citation: ResolvedCitation; causaId?: string }) {
  const id = useId(); const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [manual, setManual] = useState("");
  async function copy() {
    setBusy(true); setMessage("");
    const { kind, fragmentId, versionId, quote, quoteSha256, textSha256, sourceSha256, sourceKey, pageNumber } = citation;
    const result = await apiMutation<{ verified: boolean; href: string; warnings?: string[] }>("/api/knowledge/citations/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ citation: { kind, fragmentId, versionId, quote, quoteSha256, textSha256, sourceSha256, sourceKey, pageNumber }, ...(causaId ? { causaId } : {}) }) });
    setBusy(false);
    if (!result.ok) { setMessage(result.error); return; }
    const warnings = result.data.warnings ?? citation.warnings;
    const text = `“${quote}”\n${citation.title}${pageNumber ? ` · Página ${pageNumber}` : ""}\n${new URL(result.data.href, window.location.origin).href}${warnings?.length ? `\n${warnings.join("\n")}` : ""}`;
    try { if (!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(text); setMessage("Cita del texto registrado copiada."); } catch { setManual(text); setMessage("Seleccione y copie la cita comprobada."); }
  }
  return <div className="knowledge-citation space-y-2"><a href={citation.href} target="_blank" rel="noopener noreferrer" className="break-words text-sm font-medium text-[var(--sea)] underline">{citation.title}{citation.pageNumber ? ` · Página ${citation.pageNumber}` : ""} · Abrir fuente</a><blockquote className="max-w-[75ch] whitespace-pre-wrap break-words text-sm text-[var(--ink-soft)]">{citation.quote}</blockquote>
    {!citation.isCurrent && <p className="text-sm">La fuente cambió o tiene una captura posterior. Esta cita conserva la versión elegida.</p>}{citation.partial && <p className="text-sm">La extracción de esta fuente está incompleta.</p>}{citation.warnings?.map(w => <p key={w} className="text-sm text-[var(--ink-soft)]">{w}</p>)}
    <div className="flex flex-wrap items-start gap-2"><button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={copy}>{busy ? "Comprobando…" : "Copiar cita"}</button><BookmarkCitationButton citation={{ kind: citation.kind, fragmentId: citation.fragmentId, quote: citation.quote }} causaId={causaId || citation.causaId} siteId={citation.siteId} /></div>
    {message && <p role="status" className="text-sm">{message}</p>}{manual && <div><label htmlFor={id} className="block text-sm">Cita comprobada</label><textarea id={id} className="textarea w-full" readOnly rows={4} value={manual} onFocus={e => e.currentTarget.select()} /></div>}
  </div>;
}
