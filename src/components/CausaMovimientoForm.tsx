"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type CsvPreviewRow = {
  titulo: string;
  fecha: string;
  referencia: string | null;
  externalId: string;
  tipo: string;
  relevante: boolean;
};

export function CausaMovimientoForm({ causaId }: { causaId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<CsvPreviewRow[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewTruncated, setPreviewTruncated] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/causas/${causaId}/movimientos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: fd.get("titulo"),
        detalle: fd.get("detalle") || null,
        fecha: fd.get("fecha") || undefined,
        fuente: "manual",
      }),
    });
    setBusy(false);
    e.currentTarget.reset();
    router.refresh();
  }

  async function onImport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setImporting(true);
    setImportMessage("");
    const fd = new FormData(e.currentTarget);
    const response = await fetch(`/api/causas/${causaId}/movimientos`, {
      method: "POST",
      body: fd,
    });
    const data = await response.json().catch(() => ({}));
    setImporting(false);
    e.currentTarget.reset();
    setSelectedFile(null);
    setPreviewRows([]);
    setPreviewTotal(0);
    setPreviewTruncated(false);
    setImportMessage(
      response.ok
        ? `Importados: ${data.rows || 0} nuevos · omitidos: ${data.skipped || 0} repetidos.`
        : data.error || "No se pudo importar el CSV."
    );
    router.refresh();
  }

  async function onPreview() {
    if (!selectedFile) {
      setImportMessage("Seleccione un CSV antes de previsualizar.");
      return;
    }
    setPreviewing(true);
    setImportMessage("");
    const form = new FormData();
    form.append("file", selectedFile);
    const response = await fetch(
      `/api/causas/${causaId}/movimientos?preview=1`,
      { method: "POST", body: form }
    );
    const data = await response.json().catch(() => ({}));
    setPreviewing(false);
    if (!response.ok) {
      setPreviewRows([]);
      setPreviewTotal(0);
      setImportMessage(data.error || "No se pudo validar el CSV.");
      return;
    }
    setPreviewRows(data.rows || []);
    setPreviewTotal(data.total || 0);
    setPreviewTruncated(Boolean(data.truncated));
    setImportMessage(
      `Vista previa válida: ${data.total || 0} fila(s)${
        data.truncated ? " · se muestran las primeras 100" : ""
      }.`
    );
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-4">
        <input
          className="input md:col-span-2"
          name="titulo"
          required
          placeholder="Nuevo movimiento"
        />
        <input className="input" type="date" name="fecha" />
        <button className="btn btn-primary" disabled={busy} type="submit">
          Agregar
        </button>
        <input
          className="input md:col-span-4"
          name="detalle"
          placeholder="Detalle opcional"
        />
      </form>
      <form
        onSubmit={onImport}
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--line)] bg-white/60 p-3 text-sm"
      >
        <span className="text-[var(--ink-soft)]/75">
          Importar CSV (titulo…id,cuaderno,folio,etapa,tramite,receptor,documento)
        </span>
        <a
          className="btn btn-ghost"
          download
          href={`/api/causas/${causaId}/movimientos?format=csv`}
        >
          Exportar movimientos
        </a>
        <a
          className="btn btn-ghost"
          download
          href={`/api/causas/${causaId}/movimientos?format=csv&template=1`}
        >
          Descargar plantilla
        </a>
        <input
          className="input max-w-xs"
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          onChange={(event) => {
            setSelectedFile(event.target.files?.[0] || null);
            setPreviewRows([]);
            setPreviewTotal(0);
            setPreviewTruncated(false);
            setImportMessage("");
          }}
        />
        <button
          className="btn btn-ghost"
          disabled={previewing || importing || !selectedFile}
          onClick={onPreview}
          type="button"
        >
          {previewing ? "Validando..." : "Vista previa"}
        </button>
        <button className="btn btn-secondary" disabled={importing} type="submit">
          {importing ? "Importando..." : "Importar movimientos"}
        </button>
        {importMessage && (
          <span className="basis-full text-xs text-[var(--ink-soft)]/75" role="status">
            {importMessage}
          </span>
        )}
        {previewRows.length > 0 && (
          <div className="basis-full rounded-xl border border-[var(--line)] bg-white/70 p-3 text-xs">
            <div className="font-semibold">
              Primeras {previewRows.length} de {previewTotal} fila(s)
              {previewTruncated ? " (vista limitada)" : ""}
            </div>
            <ul className="mt-2 space-y-1 text-[var(--ink-soft)]/75">
              {previewRows.slice(0, 5).map((row, index) => (
                <li key={`${row.externalId}-${index}`}>
                  {row.fecha.slice(0, 10)} · {row.tipo} · {row.titulo}
                  {row.relevante ? " · relevante" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </div>
  );
}
