"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function UfRateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
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

  return (
    <form onSubmit={onSubmit} className="panel grid gap-3 rounded-3xl p-5 md:grid-cols-4">
      <input className="input" type="date" name="date" required />
      <input className="input" type="number" name="valueClp" min="1" required placeholder="UF en CLP" />
      <input className="input" name="source" placeholder="Fuente" defaultValue="manual" />
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Guardando..." : "Guardar UF"}
      </button>
      {error && <p className="text-sm text-[var(--danger)] md:col-span-4">{error}</p>}
    </form>
  );
}
