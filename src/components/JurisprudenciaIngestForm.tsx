"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function JurisprudenciaIngestForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const csv = String(fd.get("csv") || "").trim();
    if (csv) {
      const lines = csv.split(/\r?\n/).filter(Boolean);
      const items = lines.slice(1).map((line) => {
        const [rol, tribunal, fecha, doctrina, url, fuente] = line
          .split(";")
          .map((s) => s.trim());
        return {
          rol: rol || "sin-rol",
          tribunal: tribunal || "Tribunal",
          fecha: fecha || null,
          doctrina: doctrina || null,
          url: url || null,
          fuente: fuente || "csv",
        };
      });
      const result = await apiMutation("/api/jurisprudencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      setBusy(false);
      if (!result.ok) {
        setError(result.error || "Importación fallida");
        return;
      }
      setMsg(`Importados ${(result.data as { created?: number }).created || 0}`);
      setOpen(false);
      router.refresh();
      return;
    }

    const result = await apiMutation("/api/jurisprudencia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rol: fd.get("rol"),
        tribunal: fd.get("tribunal"),
        fecha: fd.get("fecha") || null,
        materia: fd.get("materia") || null,
        caratula: fd.get("caratula") || null,
        doctrina: fd.get("doctrina") || null,
        url: fd.get("url") || null,
        fuente: fd.get("fuente") || "manual",
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo guardar");
      return;
    }
    setMsg("Fallo incorporado.");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setOpen(true)}
        >
          Incorporar
        </button>
        {msg && <span className="text-sm text-[var(--ink-soft)]/70">{msg}</span>}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="panel space-y-3 rounded-3xl p-5">
      <h3 className="font-semibold">Incorporar jurisprudencia</h3>
      <p className="text-xs text-[var(--ink-soft)]/65">
        Alta manual o CSV con columnas{" "}
        <code>rol;tribunal;fecha;doctrina;url;fuente</code> (no es fuente oficial
        PJUD).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="input" name="rol" placeholder="Rol" />
        <input className="input" name="tribunal" placeholder="Tribunal" />
        <input className="input" type="date" name="fecha" />
        <input className="input" name="materia" placeholder="Materia" />
        <input className="input sm:col-span-2" name="caratula" placeholder="Carátula" />
        <textarea
          className="textarea sm:col-span-2"
          name="doctrina"
          placeholder="Doctrina / holding"
          rows={3}
        />
        <input className="input" name="url" placeholder="URL fuente" />
        <input className="input" name="fuente" placeholder="Fuente" defaultValue="manual" />
      </div>
      <textarea
        className="textarea font-mono text-xs"
        name="csv"
        rows={4}
        placeholder="O pegue CSV aquí (con encabezado)…"
      />
      {error && (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
