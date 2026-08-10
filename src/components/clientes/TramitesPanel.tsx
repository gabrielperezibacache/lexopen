"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { labelTramiteEstado } from "@/lib/tramites";
import {
  TRAMITE_TEMPLATES,
  templatesForMateria,
  type TramiteTemplate,
} from "@/lib/tramite-templates";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";

type Tramite = {
  id: string;
  titulo: string;
  detalle: string | null;
  estado: string;
  fechaLimite: string | Date | null;
  fechaHecho: string | Date | null;
  responsable?: { id: string; name: string } | null;
};

function fmt(d: string | Date | null) {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-CL");
}

export function TramitesPanel({
  causaId,
  tramites,
  materia,
  compact = false,
}: {
  causaId: string;
  tramites: Tramite[];
  materia?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const templates: TramiteTemplate[] = useMemo(() => {
    const list = templatesForMateria(materia);
    return list.length ? list : TRAMITE_TEMPLATES;
  }, [materia]);

  const pendientes = tramites.filter(
    (t) => t.estado === "pendiente" || t.estado === "en_curso"
  );
  const hechos = tramites.filter((t) => t.estado === "hecho");

  async function createTramite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/causas/${causaId}/tramites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: fd.get("titulo"),
        detalle: fd.get("detalle") || null,
        fechaLimite: fd.get("fechaLimite") || null,
        estado: "pendiente",
      }),
    });
    setBusy(false);
    e.currentTarget.reset();
    router.refresh();
  }

  async function setEstado(id: string, estado: string) {
    setBusy(true);
    await fetch(`/api/tramites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    setBusy(false);
    router.refresh();
  }

  async function applyTemplate() {
    if (!templateId) return;
    setBusy(true);
    await fetch(`/api/causas/${causaId}/tramites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "apply-template", templateId }),
    });
    setBusy(false);
    setTemplateId("");
    router.refresh();
  }

  async function applyAiTramites(result: AiActionResponse) {
    const data = result.data as {
      tramites?: Array<{ titulo?: string; detalle?: string; diasLimite?: number }>;
    } | null;
    const items = data?.tramites?.filter((t) => t.titulo?.trim()) || [];
    if (!items.length) return;
    setBusy(true);
    for (const item of items) {
      const fechaLimite =
        typeof item.diasLimite === "number" && item.diasLimite > 0
          ? new Date(Date.now() + item.diasLimite * 86400000)
              .toISOString()
              .slice(0, 10)
          : null;
      await fetch(`/api/causas/${causaId}/tramites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: item.titulo,
          detalle: item.detalle || null,
          fechaLimite,
          estado: "pendiente",
        }),
      });
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact && (
        <AiAssist
          action="causa.sugerir_tramites"
          causaId={causaId}
          label="Sugerir trámites con IA"
          showPreview={false}
          onResult={(r) => void applyAiTramites(r)}
        />
      )}
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-dashed border-[var(--line)] p-3">
        <label className="block min-w-[220px] flex-1 text-sm">
          <span className="mb-1 block text-xs font-medium text-[var(--ink-soft)]/70">
            Aplicar plantilla
          </span>
          <select
            className="select"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">Elegir checklist…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} ({t.items.length})
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={busy || !templateId}
          onClick={applyTemplate}
        >
          Cargar trámites
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
            Pendientes ({pendientes.length})
          </h4>
          <div className="mt-2 space-y-2">
            {pendientes.map((t) => (
              <article
                key={t.id}
                className="rounded-2xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{t.titulo}</div>
                    {t.detalle && (
                      <p className="mt-1 text-[var(--ink-soft)]/75">{t.detalle}</p>
                    )}
                    <div className="mt-1 text-xs text-[var(--ink-soft)]/60">
                      {labelTramiteEstado(t.estado)}
                      {fmt(t.fechaLimite) ? ` · límite ${fmt(t.fechaLimite)}` : ""}
                      {t.responsable ? ` · ${t.responsable.name}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {t.estado === "pendiente" && (
                      <button
                        type="button"
                        className="btn btn-ghost text-xs"
                        disabled={busy}
                        onClick={() => setEstado(t.id, "en_curso")}
                      >
                        En curso
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary text-xs"
                      disabled={busy}
                      onClick={() => setEstado(t.id, "hecho")}
                    >
                      Hecho
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {pendientes.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                Sin trámites pendientes.
              </p>
            )}
          </div>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
            Hechos ({hechos.length})
          </h4>
          <div className="mt-2 space-y-2">
            {hechos.map((t) => (
              <article
                key={t.id}
                className="rounded-2xl border border-[var(--line)]/70 bg-white/50 px-3 py-2 text-sm"
              >
                <div className="font-medium text-[var(--ink-soft)]/85">
                  {t.titulo}
                </div>
                <div className="mt-1 text-xs text-[var(--ink-soft)]/60">
                  Hecho{fmt(t.fechaHecho) ? ` · ${fmt(t.fechaHecho)}` : ""}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost mt-1 text-xs"
                  disabled={busy}
                  onClick={() => setEstado(t.id, "pendiente")}
                >
                  Reabrir
                </button>
              </article>
            ))}
            {hechos.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                Aún no hay trámites cerrados.
              </p>
            )}
          </div>
        </div>
      </div>

      <form
        onSubmit={createTramite}
        className="grid gap-2 rounded-2xl border border-dashed border-[var(--line)] p-3 md:grid-cols-4"
      >
        <input
          className="input md:col-span-2"
          name="titulo"
          required
          placeholder="Nuevo trámite pendiente"
        />
        <input className="input" type="date" name="fechaLimite" />
        <button className="btn btn-primary" disabled={busy} type="submit">
          Agregar
        </button>
        <input
          className="input md:col-span-4"
          name="detalle"
          placeholder="Detalle opcional"
        />
      </form>
    </div>
  );
}
