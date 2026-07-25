"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function DocumentoUploadForm({
  causas,
}: {
  causas: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/documentos", {
      method: "POST",
      body: new FormData(e.currentTarget),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo subir el documento");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel grid gap-4 rounded-3xl p-5 md:grid-cols-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Archivo</label>
        <input className="input" type="file" name="file" required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Nombre opcional</label>
        <input className="input" name="nombre" placeholder="Usa el nombre del archivo" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Tipo</label>
        <select className="select" name="tipo" defaultValue="otro">
          <option value="escrito">Escrito</option>
          <option value="contrato">Contrato</option>
          <option value="minuta">Minuta</option>
          <option value="evidencia">Evidencia</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Causa</label>
        <select className="select" name="causaId" defaultValue="">
          <option value="">Sin causa</option>
          {causas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confidencial" /> Confidencial
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="privilegio" /> Privilegio
      </label>
      <div className="md:col-span-2 md:text-right">
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Subiendo..." : "Subir documento"}
        </button>
      </div>
      {error && <p className="text-sm text-[var(--danger)] md:col-span-4">{error}</p>}
    </form>
  );
}
