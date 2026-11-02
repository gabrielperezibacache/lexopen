"use client";

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { FolioSymbol } from "@/components/ui/FolioSymbol";

export function CasePreparationExport({ causaId, filter, disabled }: { causaId: string; filter: { q: string; status: string; after: string }; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function download(format: "markdown" | "csv") {
    setBusy(true); setError(""); setMessage("");
    try {
      const query = new URLSearchParams(Object.entries({ ...filter, format }).filter(([, value]) => Boolean(value)));
      const response = await fetch(`/api/causas/${causaId}/knowledge/export?${query}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "No se pudo preparar el archivo. Actualice las fuentes y vuelva a intentarlo.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = format === "csv" ? "lexopen-cronologia.csv" : "lexopen-preparacion.md";
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setMessage("Archivo preparado con el alcance y las referencias comprobadas al descargar.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo descargar la hoja."); }
    finally { setBusy(false); }
  }
  return <details className="knowledge-export">
    <summary><FolioSymbol variant="evidence" className="h-9 w-9 shrink-0" /><span>Llevar los hechos al escrito</span><ChevronDown className="knowledge-export-chevron" size={18} aria-hidden="true" /></summary>
    <div className="knowledge-export-body">
      <h3 className="display text-xl">Una hoja de trabajo, con su respaldo</h3>
      <p>Reúna los hechos activos de esta página, su cronología y los pasajes que los respaldan. Se respetan los filtros actuales y se vuelven a comprobar las fuentes al descargar.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" disabled={disabled || busy} onClick={() => download("markdown")}><Download size={16} aria-hidden="true" />Descargar hoja de preparación</button>
        <button type="button" className="btn btn-ghost" disabled={disabled || busy} onClick={() => download("csv")}>Descargar cronología CSV</button>
      </div>
      <p className="knowledge-export-footnote">La hoja Markdown sirve como base editable. El CSV conserva fechas inciertas, estados de revisión y citas. Ambos indican su alcance; los enlaces requieren acceso a LexOpen.</p>
      <p role="status" aria-live="polite">{busy ? "Cotejando las fuentes para preparar el archivo…" : message}</p>
      {error && <p role="alert" className="text-[var(--danger)]">{error}</p>}
    </div>
  </details>;
}
