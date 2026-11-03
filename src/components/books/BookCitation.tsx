"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { BookCitation as Citation, BookCitationInput } from "@/lib/books/types";
import { citationText, copyBookText, verifiedBookCitation } from "./client";
import { withCaseBookContext } from "@/lib/causas/workflow-links";

export function BookCitation({ citation, title, location, verificationBasis, causaId, draftId }: { citation: Citation | BookCitationInput; title?: string; location?: string; verificationBasis?: "original" | "retained_text"; causaId?: string; draftId?: string }) {
  const id = useId(), [busy, setBusy] = useState(false), [verified, setVerified] = useState(false), [message, setMessage] = useState(""), [manual, setManual] = useState("");
  const [verifiedBasis, setVerifiedBasis] = useState<"original" | "retained_text" | null>(null);
  const textOnly = (verifiedBasis || ("verificationBasis" in citation ? citation.verificationBasis : verificationBasis)) === "retained_text";
  async function copy() {
    setBusy(true); setMessage(""); setManual("");
    try { const resolved = await verifiedBookCitation(citation); const text = citationText(resolved); setVerified(true); setVerifiedBasis(resolved.verificationBasis || "original"); if (await copyBookText(text)) setMessage(resolved.verificationBasis === "retained_text" ? "Cita y localización copiadas tras comprobar el texto conservado. El original no está conservado en LexOpen." : "Cita y localización copiadas tras comprobar el original conservado."); else { setManual(text); setMessage("Cita comprobada. Seleccione el texto para copiarlo."); } }
    catch (error) { setVerified(false); setMessage(error instanceof Error ? error.message : "La fuente no pudo comprobarse. Vuelva a abrir el libro."); }
    finally { setBusy(false); }
  }
  const href = withCaseBookContext("href" in citation ? citation.href : `/biblioteca/${citation.bookId}`, causaId, draftId);
  return <div className="book-citation"><div className="book-citation-heading"><Link href={href} className="book-source-link">{title || ("title" in citation ? citation.title : "Abrir libro")}<ExternalLink size={14} /></Link>{location && <span>{location}</span>}</div><blockquote>{citation.quote}</blockquote>{"partial" in citation && citation.partial && <p className="book-small">Extracción parcial. Revise la fidelidad del pasaje antes de utilizarlo.</p>}{"extractionMethod" in citation && citation.extractionMethod === "ocr" && <p className="book-small">{textOnly ? "Texto obtenido mediante OCR. El original no está conservado para cotejo visual." : "Texto OCR: revise también la imagen de la página."}</p>}{textOnly && <p className="book-small">{verified || "sourceKey" in citation ? "Cotejada con texto conservado; original no conservado." : "El cotejo se realiza contra el texto conservado; original no conservado."}</p>}<button className="book-text-action" type="button" onClick={copy} disabled={busy}>{verified ? <Check size={15} /> : <Copy size={15} />}{busy ? "Comprobando fuente…" : "Verificar y copiar cita"}</button>{message && <p role="status" className="book-small">{message}</p>}{manual && <div className="book-field"><label htmlFor={id}>Cita comprobada</label><textarea id={id} className="textarea" rows={5} readOnly value={manual} onFocus={event => event.currentTarget.select()} /></div>}</div>;
}
