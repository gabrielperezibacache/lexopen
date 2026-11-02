"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

type Plantilla = {
  id: string;
  tipo: string;
  nombre: string;
  materia: string | null;
  bodyJson: string;
};

export function MinutaPlantillasManager({
  plantillas,
}: {
  plantillas: Plantilla[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    const result = await apiMutation("/api/minutas/plantillas", {
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
    if (!result.ok) {
      setError(result.error || "No se pudo crear la plantilla");
      return;
    }
    form.reset();
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    const result = await apiMutation(
      `/api/minutas/plantillas?id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo eliminar");
      return;
    }
    router.refresh();
  }

  return (
    <section className="panel rounded-[var(--radius-lg)] p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Plantillas de minutas</h2>
        <p className="text-sm text-[var(--muted)]">
          Cree plantillas reutilizables para audiencias, reuniones y llamadas.
        </p>
      </div>
      <form onSubmit={create} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block space-y-2 text-sm font-medium">
        <span>Tipo</span>
        <input className="input" name="tipo" required placeholder="Tipo" />
      </label>
        <label className="block space-y-2 text-sm font-medium">
        <span>Nombre</span>
        <input className="input" name="nombre" required placeholder="Nombre" />
      </label>
        <label className="block space-y-2 text-sm font-medium">
        <span>Materia</span>
        <input className="input" name="materia" placeholder="Materia" />
      </label>
        <button className="btn btn-primary" disabled={busy} type="submit">
          Crear
        </button>
        <label className="block space-y-2 text-sm font-medium sm:col-span-2 lg:col-span-4">
        <span>Contenido de la plantilla (JSON)</span>
        <textarea
          className="textarea"
          name="bodyJson"
          placeholder='{"titulo":"Audiencia"}'
        />
      </label>
      </form>
      {error && (
        <p className="mt-3 text-sm text-[var(--danger)]" role="status">
          {error}
        </p>
      )}
      <div className="mt-5 divide-y divide-[var(--line)]">
        {plantillas.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div>
              <div className="font-medium">{p.nombre}</div>
              <div className="text-xs text-[var(--muted)]">
                {p.tipo}
                {p.materia ? ` · ${p.materia}` : ""}
              </div>
            </div>
            <button
              className="btn btn-ghost"
              disabled={busy}
              type="button"
              onClick={() => void remove(p.id)}
            >
              Eliminar
            </button>
          </div>
        ))}
        {plantillas.length === 0 && (
          <p className="py-3 text-sm text-[var(--muted)]">
            Sin plantillas configuradas.
          </p>
        )}
      </div>
    </section>
  );
}
