"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { MATERIAS, ETAPAS, TRIBUNALES_CHILE } from "@/lib/chile";

export default function NuevaCausaPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const payload = {
      titulo: String(fd.get("titulo")),
      rit: String(fd.get("rit") || ""),
      ruc: String(fd.get("ruc") || ""),
      tribunal: String(fd.get("tribunal")),
      materia: String(fd.get("materia")),
      procedimiento: String(fd.get("procedimiento") || ""),
      etapa: String(fd.get("etapa")),
      caratula: String(fd.get("caratula") || ""),
      resumen: String(fd.get("resumen") || ""),
      partes: [
        {
          nombre: String(fd.get("demandante") || ""),
          rol: "demandante",
        },
        {
          nombre: String(fd.get("demandado") || ""),
          rol: "demandado",
        },
      ].filter((p) => p.nombre),
    };

    const res = await fetch("/api/causas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo crear la causa");
      return;
    }
    const causa = await res.json();
    router.push(`/causas/${causa.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          Alta de litigio
        </p>
        <h1 className="display mt-2 text-4xl">Nueva causa</h1>
      </div>

      <form onSubmit={onSubmit} className="panel space-y-4 rounded-3xl p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">Título</label>
          <input className="input" name="titulo" required placeholder="Ej. Cobro de pesos — contrato" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">RIT</label>
            <input className="input" name="rit" placeholder="C-1234-2026" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">RUC</label>
            <input className="input" name="ruc" placeholder="Opcional" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Tribunal</label>
          <select className="select" name="tribunal" required defaultValue={TRIBUNALES_CHILE[0]}>
            {TRIBUNALES_CHILE.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Materia</label>
            <select className="select" name="materia" defaultValue="civil">
              {MATERIAS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Etapa</label>
            <select className="select" name="etapa" defaultValue="ingreso">
              {ETAPAS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Procedimiento</label>
          <input className="input" name="procedimiento" placeholder="Ordinario, monitorio, protección…" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Carátula</label>
          <input className="input" name="caratula" placeholder="A con B" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Demandante / recurrente</label>
            <input className="input" name="demandante" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Demandado / recorrido</label>
            <input className="input" name="demandado" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Resumen</label>
          <textarea className="textarea" name="resumen" />
        </div>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <button className="btn btn-primary" disabled={loading} type="submit">
          {loading ? "Guardando…" : "Crear causa"}
        </button>
      </form>
    </div>
  );
}
