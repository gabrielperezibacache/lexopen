"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function CausaMovimientoForm({ causaId }: { causaId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");

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
    setImportMessage(
      response.ok
        ? `Importados: ${data.rows || 0} nuevos · omitidos: ${data.skipped || 0} repetidos.`
        : data.error || "No se pudo importar el CSV."
    );
    router.refresh();
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
          Importar CSV (titulo,detalle,fecha,referencia,id)
        </span>
        <input
          className="input max-w-xs"
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
        />
        <button className="btn btn-secondary" disabled={importing} type="submit">
          {importing ? "Importando..." : "Importar movimientos"}
        </button>
        {importMessage && (
          <span className="basis-full text-xs text-[var(--ink-soft)]/75" role="status">
            {importMessage}
          </span>
        )}
      </form>
    </div>
  );
}
