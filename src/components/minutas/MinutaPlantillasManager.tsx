"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Plantilla = {
  id: string;
  tipo: string;
  nombre: string;
  materia: string | null;
  bodyJson: string;
};

export function MinutaPlantillasManager({ plantillas }: { plantillas: Plantilla[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    await fetch("/api/minutas/plantillas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: fd.get("tipo"),
        nombre: fd.get("nombre"),
        materia: fd.get("materia") || null,
        bodyJson: fd.get("bodyJson") || "{}",
      }),
    });
    setBusy(false);
    e.currentTarget.reset();
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    await fetch(`/api/minutas/plantillas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="panel rounded-3xl p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Plantillas de minutas</h2>
        <p className="text-sm text-[var(--ink-soft)]/70">
          Cree plantillas reutilizables para audiencias, reuniones y llamadas.
        </p>
      </div>
      <form onSubmit={create} className="grid gap-3 md:grid-cols-4">
        <input className="input" name="tipo" required placeholder="Tipo" />
        <input className="input" name="nombre" required placeholder="Nombre" />
        <input className="input" name="materia" placeholder="Materia" />
        <button className="btn btn-primary" disabled={busy} type="submit">
          Crear
        </button>
        <textarea className="textarea md:col-span-4" name="bodyJson" placeholder='{"titulo":"Audiencia"}' />
      </form>
      <div className="mt-5 divide-y divide-[var(--line)]">
        {plantillas.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <div className="font-medium">{p.nombre}</div>
              <div className="text-xs text-[var(--ink-soft)]/65">
                {p.tipo}
                {p.materia ? ` · ${p.materia}` : ""}
              </div>
            </div>
            <button className="btn btn-ghost" disabled={busy} type="button" onClick={() => remove(p.id)}>
              Eliminar
            </button>
          </div>
        ))}
        {plantillas.length === 0 && (
          <p className="py-3 text-sm text-[var(--ink-soft)]/65">Sin plantillas configuradas.</p>
        )}
      </div>
    </section>
  );
}
