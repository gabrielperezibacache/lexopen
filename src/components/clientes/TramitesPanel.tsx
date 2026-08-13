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

type Responsable = { id: string; name: string };

function fmt(d: string | Date | null) {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("es-CL");
}

function toDateInput(d: string | Date | null) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function TramitesPanel({
  causaId,
  tramites,
  materia,
  compact = false,
  responsables = [],
}: {
  causaId: string;
  tramites: Tramite[];
  materia?: string | null;
  compact?: boolean;
  responsables?: Responsable[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const templates: TramiteTemplate[] = useMemo(() => {
    const list = templatesForMateria(materia);
    return list.length ? list : TRAMITE_TEMPLATES;
  }, [materia]);

  const pendientes = tramites.filter(
    (t) => t.estado === "pendiente" || t.estado === "en_curso"
  );
  const hechos = tramites.filter((t) => t.estado === "hecho");
  const cancelados = tramites.filter((t) => t.estado === "cancelado");

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
        responsableId: String(fd.get("responsableId") || "") || null,
        estado: "pendiente",
      }),
    });
    setBusy(false);
    e.currentTarget.reset();
    router.refresh();
  }

  async function patchTramite(
    id: string,
    body: Record<string, unknown>
  ) {
    setBusy(true);
    await fetch(`/api/tramites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    setEditingId(null);
    router.refresh();
  }

  async function setEstado(id: string, estado: string) {
    await patchTramite(id, { estado });
  }

  async function deleteTramite(id: string) {
    if (!window.confirm("¿Eliminar este trámite?")) return;
    setBusy(true);
    await fetch(`/api/tramites/${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await patchTramite(id, {
      titulo: fd.get("titulo"),
      detalle: fd.get("detalle") || null,
      fechaLimite: fd.get("fechaLimite") || null,
      responsableId: String(fd.get("responsableId") || "") || null,
    });
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

  function rowActions(t: Tramite) {
    return (
      <div className="flex flex-wrap gap-1">
        {t.estado === "pendiente" && (
          <button
            type="button"
            className="btn btn-ghost text-xs"
            disabled={busy}
            onClick={() => void setEstado(t.id, "en_curso")}
          >
            En curso
          </button>
        )}
        {(t.estado === "pendiente" || t.estado === "en_curso") && (
          <>
            <button
              type="button"
              className="btn btn-secondary text-xs"
              disabled={busy}
              onClick={() => void setEstado(t.id, "hecho")}
            >
              Hecho
            </button>
            <button
              type="button"
              className="btn btn-ghost text-xs"
              disabled={busy}
              onClick={() => setEditingId(editingId === t.id ? null : t.id)}
            >
              Editar
            </button>
            <button
              type="button"
              className="btn btn-ghost text-xs"
              disabled={busy}
              onClick={() => void setEstado(t.id, "cancelado")}
            >
              Cancelar
            </button>
          </>
        )}
        {t.estado === "hecho" && (
          <button
            type="button"
            className="btn btn-ghost text-xs"
            disabled={busy}
            onClick={() => void setEstado(t.id, "pendiente")}
          >
            Reabrir
          </button>
        )}
        {t.estado === "cancelado" && (
          <button
            type="button"
            className="btn btn-ghost text-xs"
            disabled={busy}
            onClick={() => void setEstado(t.id, "pendiente")}
          >
            Reabrir
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost text-xs text-[var(--danger)]"
          disabled={busy}
          onClick={() => void deleteTramite(t.id)}
        >
          Eliminar
        </button>
      </div>
    );
  }

  function editForm(t: Tramite) {
    if (editingId !== t.id) return null;
    return (
      <form
        onSubmit={(e) => void saveEdit(e, t.id)}
        className="mt-2 grid gap-2 rounded-xl border border-dashed border-[var(--line)] p-2 md:grid-cols-2"
      >
        <input
          className="input md:col-span-2"
          name="titulo"
          required
          defaultValue={t.titulo}
        />
        <input
          className="input"
          type="date"
          name="fechaLimite"
          defaultValue={toDateInput(t.fechaLimite)}
        />
        <select
          className="select"
          name="responsableId"
          defaultValue={t.responsable?.id || ""}
        >
          <option value="">Sin responsable</option>
          {responsables.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input
          className="input md:col-span-2"
          name="detalle"
          defaultValue={t.detalle || ""}
          placeholder="Detalle opcional"
        />
        <div className="flex gap-2 md:col-span-2">
          <button className="btn btn-primary text-xs" disabled={busy} type="submit">
            Guardar
          </button>
          <button
            className="btn btn-ghost text-xs"
            type="button"
            disabled={busy}
            onClick={() => setEditingId(null)}
          >
            Descartar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <AiAssist
        action="causa.sugerir_tramites"
        causaId={causaId}
        label="Sugerir trámites con IA"
        showPreview={false}
        onResult={(r) => void applyAiTramites(r)}
      />
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
          onClick={() => void applyTemplate()}
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
                  {rowActions(t)}
                </div>
                {editForm(t)}
              </article>
            ))}
            {pendientes.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                Sin trámites pendientes. Use una plantilla o pida sugerencias a la IA.
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
                  {t.responsable ? ` · ${t.responsable.name}` : ""}
                </div>
                <div className="mt-1">{rowActions(t)}</div>
              </article>
            ))}
            {hechos.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                Aún no hay trámites cerrados.
              </p>
            )}
            {cancelados.length > 0 && (
              <div className="pt-2">
                <h5 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]/45">
                  Cancelados ({cancelados.length})
                </h5>
                <div className="mt-2 space-y-2">
                  {cancelados.map((t) => (
                    <article
                      key={t.id}
                      className="rounded-2xl border border-[var(--line)]/50 bg-white/40 px-3 py-2 text-sm opacity-80"
                    >
                      <div className="font-medium">{t.titulo}</div>
                      <div className="mt-1">{rowActions(t)}</div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <form
        onSubmit={(e) => void createTramite(e)}
        className="grid grid-cols-1 gap-2 rounded-2xl border border-dashed border-[var(--line)] p-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <input
          className="input sm:col-span-2"
          name="titulo"
          required
          placeholder="Nuevo trámite pendiente"
        />
        <input className="input" type="date" name="fechaLimite" />
        <button className="btn btn-primary" disabled={busy} type="submit">
          Agregar
        </button>
        <select className="select sm:col-span-2" name="responsableId" defaultValue="">
          <option value="">Responsable (yo por defecto)</option>
          {responsables.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input
          className="input sm:col-span-2"
          name="detalle"
          placeholder="Detalle opcional"
        />
      </form>
    </div>
  );
}
