"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function CausaMovimientoForm({ causaId }: { causaId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

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

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-4">
      <input className="input md:col-span-2" name="titulo" required placeholder="Nuevo movimiento" />
      <input className="input" type="date" name="fecha" />
      <button className="btn btn-primary" disabled={busy} type="submit">
        Agregar
      </button>
      <input className="input md:col-span-4" name="detalle" placeholder="Detalle opcional" />
    </form>
  );
}
