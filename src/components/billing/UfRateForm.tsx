"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function UfRateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/uf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: fd.get("date"),
        valueClp: Number(fd.get("valueClp")),
        source: fd.get("source") || "manual",
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo guardar la UF");
      return;
    }
    e.currentTarget.reset();
    router.refresh();
  }

  async function syncNow() {
    setSyncBusy(true);
    setError("");
    setMsg("");
    const result = await apiMutation("/api/uf/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    setSyncBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo sincronizar UF");
      return;
    }
    const data = result.data as { upserted?: number };
    setMsg(`Sincronizados ${data.upserted ?? 0} valores desde mindicador.cl`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--ink-soft)]/70">
          Carga manual o sincronización automática (mindicador.cl).
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={syncBusy}
          onClick={syncNow}
        >
          {syncBusy ? "Sincronizando…" : "Actualizar ahora"}
        </button>
      </div>
      {msg && <p className="text-sm text-[var(--ink-soft)]/80">{msg}</p>}
      <form
        onSubmit={onSubmit}
        className="panel grid grid-cols-1 gap-3 rounded-3xl p-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <input className="input" type="date" name="date" required />
        <input
          className="input"
          type="number"
          name="valueClp"
          min="1"
          required
          placeholder="UF en CLP"
        />
        <input
          className="input"
          name="source"
          placeholder="Fuente"
          defaultValue="manual"
        />
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Guardando..." : "Guardar UF"}
        </button>
        {error && (
          <p className="text-sm text-[var(--danger)] md:col-span-4">{error}</p>
        )}
      </form>
    </div>
  );
}
