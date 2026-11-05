"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import { parseMinutaTemplate } from "@/lib/minutas/template";
import { TIPOS_MINUTA, labelTipoMinuta } from "@/lib/minutas";

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
    let bodyJson: string;
    try {
      const advanced = String(fd.get("bodyJson") || "").trim();
      bodyJson = advanced || JSON.stringify({ titulo: String(fd.get("titulo") || ""), resumenEjecutivo: String(fd.get("resumenEjecutivo") || ""), hechosRelevantes: String(fd.get("hechosRelevantes") || ""), acuerdos: String(fd.get("acuerdos") || ""), riesgosAlertas: String(fd.get("riesgosAlertas") || ""), proximosPasos: String(fd.get("proximosPasos") || "").split("\n").map(line => line.trim()).filter(Boolean) });
      parseMinutaTemplate(bodyJson);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Revisa el contenido de la plantilla."); setBusy(false); return; }
    const result = await apiMutation("/api/minutas/plantillas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: fd.get("tipo"),
        nombre: fd.get("nombre"),
        materia: fd.get("materia") || null,
        bodyJson,
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
    <section className="panel rounded-[var(--radius-lg)] p-5" aria-label="Plantillas de minutas">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Plantillas de minutas</h2>
        <p className="text-sm text-[var(--muted)]">
          Cree plantillas reutilizables para audiencias, reuniones y llamadas.
        </p>
      </div>
      <form onSubmit={create} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block space-y-2 text-sm font-medium">
        <span>Tipo</span>
        <select className="select" name="tipo" required disabled={busy}>{TIPOS_MINUTA.map(tipo=><option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}</select>
      </label>
        <label className="block space-y-2 text-sm font-medium">
        <span>Nombre</span>
        <input className="input" name="nombre" required placeholder="Nombre" disabled={busy}/>
      </label>
        <label className="block space-y-2 text-sm font-medium">
        <span>Materia</span>
        <input className="input" name="materia" placeholder="Materia" disabled={busy}/>
      </label>
        <button className="btn btn-primary" disabled={busy} type="submit">
          Crear
        </button>
        <details className="sm:col-span-2 lg:col-span-4"><summary className="cursor-pointer text-sm font-medium">Añadir textos sugeridos a la plantilla</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">{[{name:"titulo",label:"Título sugerido"},{name:"resumenEjecutivo",label:"Resumen"},{name:"hechosRelevantes",label:"Hechos relevantes"},{name:"acuerdos",label:"Acuerdos"},{name:"riesgosAlertas",label:"Riesgos y alertas"},{name:"proximosPasos",label:"Próximos pasos · uno por línea"}].map(field=><label key={field.name} className="block space-y-2 text-sm"><span>{field.label}</span><textarea className="textarea" name={field.name} rows={3} disabled={busy} maxLength={field.name==="titulo"?300:8000}/></label>)}</div></details>
        <details className="sm:col-span-2 lg:col-span-4"><summary className="cursor-pointer text-sm text-[var(--ink-soft)]">Formato avanzado de la plantilla</summary><p className="my-2 text-sm text-[var(--ink-soft)]">Si importas una plantilla en JSON, su contenido reemplaza los textos sugeridos de este formulario.</p><label className="block space-y-2 text-sm"><span>Contenido de la plantilla (JSON)</span><textarea className="textarea" name="bodyJson" disabled={busy} maxLength={60000} placeholder='{"titulo":"Audiencia"}'/></label></details>
      </form>
      {error && (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
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
                {labelTipoMinuta(p.tipo)}
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
