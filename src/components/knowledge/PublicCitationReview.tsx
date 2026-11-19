"use client";

import Link from "next/link";
import { useState } from "react";
import type { ResolvedCitation } from "@/lib/knowledge/citations";
import { BookmarkCitationButton } from "./BookmarkCitationButton";

export function PublicCitationReview({ collectionId, itemId }: { collectionId: string; itemId: string }) {
  const [result, setResult] = useState<{ href: string; citation: ResolvedCitation | null; needsRecovery?: boolean } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function review() {
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const response = await fetch(`/api/knowledge/collections/${collectionId}/items/${itemId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cotejar la cita.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cotejar la cita.");
    } finally { setBusy(false); }
  }
  return <div className="space-y-2 text-sm">
    <p>Esta cita procede de una captura judicial pendiente de revisión.</p>
    <button type="button" className="btn btn-secondary" disabled={busy} onClick={review}>{busy ? "Cotejando…" : "Cotejar con la versión pública"}</button>
    {error && <p role="alert">{error}</p>}
    {result?.needsRecovery && <Link className="text-[var(--sea)] underline" href={result.href}>Recuperar la versión pública del fallo para cotejar esta cita</Link>}
    {result && !result.needsRecovery && <div className="space-y-2">
      <p role="status">{result.citation ? "Se encontró el pasaje literal en la versión pública. Revíselo antes de guardarlo." : "No se encontró una coincidencia única. Seleccione el pasaje en la versión pública."}</p>
      {result.citation && <blockquote className="source-quotation whitespace-pre-wrap break-words">{result.citation.quote}</blockquote>}
      <Link className="text-[var(--sea)] underline" href={result.href}>Abrir versión pública recuperada</Link>
      {result.citation && <BookmarkCitationButton initialCollectionId={collectionId} citation={{ kind: "legal", fragmentId: result.citation.fragmentId, quote: result.citation.quote }} />}
    </div>}
  </div>;
}
