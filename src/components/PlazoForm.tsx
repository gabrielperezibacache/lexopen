"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";

type Option = { id: string; label: string };

type Draft = {
  titulo: string;
  descripcion: string;
  diasPlazo: string;
  tipoComputo: "habiles" | "corridos";
  esFatal: boolean;
  tipo: string;
  causaId: string;
};

const emptyDraft = (): Draft => ({
  titulo: "",
  descripcion: "",
  diasPlazo: "",
  tipoComputo: "habiles",
  esFatal: false,
  tipo: "procesal",
  causaId: "",
});

export function PlazoForm({
  causas,
  responsables,
}: {
  causas: Option[];
  responsables: Option[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [suggestions, setSuggestions] = useState<
    Array<{
      titulo: string;
      dias: number;
      tipoComputo: string;
      esFatal: boolean;
      tipo: string;
      descripcion: string;
    }>
  >([]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const diasPlazo = String(fd.get("diasPlazo") || draft.diasPlazo || "");
    const payload = {
      titulo: String(fd.get("titulo") || draft.titulo || ""),
      descripcion: String(fd.get("descripcion") || draft.descripcion || ""),
      fechaLimite: String(fd.get("fechaLimite") || "") || null,
      fechaNotificacion: String(fd.get("fechaNotificacion") || "") || null,
      diasPlazo: diasPlazo ? Number(diasPlazo) : null,
      tipoComputo: String(fd.get("tipoComputo") || draft.tipoComputo || "habiles"),
      esFatal: fd.get("esFatal") === "on" || draft.esFatal,
      tipo: String(fd.get("tipo") || draft.tipo || "procesal"),
      causaId: String(fd.get("causaId") || draft.causaId || "") || null,
      responsableId: String(fd.get("responsableId") || "") || null,
    };
    const res = await fetch("/api/plazos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo crear el plazo");
      return;
    }
    e.currentTarget.reset();
    setDraft(emptyDraft());
    setSuggestions([]);
    router.refresh();
  }

  function onSuggest(result: AiActionResponse) {
    const data = result.data as {
      plazos?: Array<{
        titulo?: string;
        dias?: number;
        tipoComputo?: string;
        esFatal?: boolean;
        tipo?: string;
        descripcion?: string;
      }>;
    } | null;
    const rows =
      data?.plazos
        ?.filter((p) => p.titulo)
        .map((p) => ({
          titulo: String(p.titulo),
          dias: Number(p.dias) || 5,
          tipoComputo: p.tipoComputo === "corridos" ? "corridos" : "habiles",
          esFatal: Boolean(p.esFatal),
          tipo: p.tipo || "procesal",
          descripcion: p.descripcion || "",
        })) || [];
    setSuggestions(rows);
    if (rows[0]) {
      setDraft((d) => ({
        ...d,
        titulo: rows[0].titulo,
        descripcion: rows[0].descripcion,
        diasPlazo: String(rows[0].dias),
        tipoComputo: rows[0].tipoComputo as "habiles" | "corridos",
        esFatal: rows[0].esFatal,
        tipo: rows[0].tipo,
      }));
    }
  }

  return (
    <div className="space-y-3">
      <div className="panel rounded-3xl p-4">
        <AiAssist
          action="plazo.sugerir"
          label="Sugerir plazos con IA"
          causaId={draft.causaId || undefined}
          showPreview={false}
          onResult={onSuggest}
        />
        {suggestions.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.titulo}
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    titulo: s.titulo,
                    descripcion: s.descripcion,
                    diasPlazo: String(s.dias),
                    tipoComputo: s.tipoComputo as "habiles" | "corridos",
                    esFatal: s.esFatal,
                    tipo: s.tipo,
                  }))
                }
              >
                Usar: {s.titulo}
              </button>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="panel grid gap-4 rounded-3xl p-5 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label className="mb-1 block text-sm font-medium">Título</label>
          <input
            className="input"
            name="titulo"
            required
            placeholder="Ej. Contestar demanda"
            value={draft.titulo}
            onChange={(e) => setDraft((d) => ({ ...d, titulo: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Causa</label>
          <select
            className="select"
            name="causaId"
            value={draft.causaId}
            onChange={(e) => setDraft((d) => ({ ...d, causaId: e.target.value }))}
          >
            <option value="">Sin causa</option>
            {causas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Responsable</label>
          <select className="select" name="responsableId" defaultValue="">
            <option value="">Yo / por asignar</option>
            {responsables.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Notificación</label>
          <input className="input" type="date" name="fechaNotificacion" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Días plazo</label>
          <input
            className="input"
            type="number"
            min="1"
            name="diasPlazo"
            placeholder="5"
            value={draft.diasPlazo}
            onChange={(e) => setDraft((d) => ({ ...d, diasPlazo: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Cómputo</label>
          <select
            className="select"
            name="tipoComputo"
            value={draft.tipoComputo}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                tipoComputo: e.target.value as "habiles" | "corridos",
              }))
            }
          >
            <option value="habiles">Hábiles</option>
            <option value="corridos">Corridos</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Fecha límite directa</label>
          <input className="input" type="date" name="fechaLimite" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Tipo</label>
          <select
            className="select"
            name="tipo"
            value={draft.tipo}
            onChange={(e) => setDraft((d) => ({ ...d, tipo: e.target.value }))}
          >
            <option value="procesal">Procesal</option>
            <option value="interno">Interno</option>
            <option value="audiencia">Audiencia</option>
          </select>
        </div>
        <label className="flex items-end gap-2 pb-3 text-sm">
          <input
            type="checkbox"
            name="esFatal"
            checked={draft.esFatal}
            onChange={(e) => setDraft((d) => ({ ...d, esFatal: e.target.checked }))}
          />{" "}
          Fatal
        </label>
        <div className="lg:col-span-2">
          <label className="mb-1 block text-sm font-medium">Descripción</label>
          <input
            className="input"
            name="descripcion"
            placeholder="Notas del cómputo"
            value={draft.descripcion}
            onChange={(e) => setDraft((d) => ({ ...d, descripcion: e.target.value }))}
          />
        </div>
        <div className="flex items-end">
          <button className="btn btn-primary w-full" disabled={busy} type="submit">
            {busy ? "Guardando..." : "Crear plazo"}
          </button>
        </div>
        {error && <p className="text-sm text-[var(--danger)] lg:col-span-4">{error}</p>}
      </form>
    </div>
  );
}
