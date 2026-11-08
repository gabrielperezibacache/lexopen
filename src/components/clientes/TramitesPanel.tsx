"use client";

import { FormEvent, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { labelTramiteEstado } from "@/lib/tramites";
import {
  TRAMITE_TEMPLATES,
  templatesForMateria,
  type TramiteTemplate,
} from "@/lib/tramite-templates";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { apiMutation } from "@/lib/api-mutation";
import { operationKey, createSubmissionKeys } from "@/lib/client-submission-key";
import { civilDateKey } from "@/lib/chile-time";
import { useI18n } from "@/components/i18n/I18nProvider";

type Tramite = {
  id: string;
  updatedAt?: string | Date;
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
  return new Intl.DateTimeFormat("es-CL", { timeZone: "UTC" }).format(new Date(civilDateKey(date) + "T12:00:00.000Z"));
}

function toDateInput(d: string | Date | null) {
  if (!d) return "";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return civilDateKey(date);
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
  const { t, dict } = useI18n();
  const router = useRouter();
  const [aiError, setAiError] = useState("");
  const keys = useRef(new Map<string, string>());
  const createKeys = useRef(createSubmissionKeys(undefined, `tramite.create:${causaId}`));
  const pendingCreate = useRef<{ body: string; key: string } | null>(null);
  const [retryCreate, setRetryCreate] = useState(false);
  function keyFor(value: unknown) { const k = JSON.stringify(value); if (!keys.current.has(k)) keys.current.set(k, operationKey()); return keys.current.get(k)!; }
  const [busy, setBusy] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const templates: TramiteTemplate[] = useMemo(() => {
    const list = templatesForMateria(materia);
    return list.length ? list : TRAMITE_TEMPLATES;
  }, [materia]);

  // ⚡ Bolt: Group tramites in a single O(N) pass and memoize to avoid redundant iterations and array allocations on every render.
  const { pendientes, hechos, cancelados } = useMemo(() => {
    return tramites.reduce(
      (acc, t) => {
        if (t.estado === "pendiente" || t.estado === "en_curso") {
          acc.pendientes.push(t);
        } else if (t.estado === "hecho") {
          acc.hechos.push(t);
        } else if (t.estado === "cancelado") {
          acc.cancelados.push(t);
        }
        return acc;
      },
      { pendientes: [] as Tramite[], hechos: [] as Tramite[], cancelados: [] as Tramite[] }
    );
  }, [tramites]);

  async function createTramite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    if (!pendingCreate.current) {
      const body = JSON.stringify({
        titulo: fd.get("titulo"),
        detalle: fd.get("detalle") || null,
        fechaLimite: fd.get("fechaLimite") || null,
        responsableId: String(fd.get("responsableId") || "") || null,
        estado: "pendiente",
      });
      pendingCreate.current = { body, key: createKeys.current.forPayload(JSON.parse(body)) };
    }
    const result = await apiMutation(`/api/causas/${causaId}/tramites`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": pendingCreate.current.key }, body: pendingCreate.current.body });
    setBusy(false);
    if (!result.ok) { const uncertain = result.status === 0 || result.status >= 500; if (!uncertain) pendingCreate.current = null; setRetryCreate(uncertain); setAiError(result.error + (uncertain ? ". Reintente el mismo envío para comprobar su resultado." : "")); return; }
    createKeys.current.complete(JSON.parse(pendingCreate.current.body));
    pendingCreate.current = null; setRetryCreate(false); setAiError("");
    form.reset();
    router.refresh();
  }

  async function patchTramite(
    id: string,
    body: Record<string, unknown>
  ) {
    const version = tramites.find(t => t.id === id)?.updatedAt;
    body = { ...body, ...(version ? { expectedUpdatedAt: new Date(version).toISOString() } : {}) };
    setBusy(true);
    const result = await apiMutation(`/api/tramites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Idempotency-Key": keyFor({id,body}) },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!result.ok) { setAiError(result.error); return; }
    setAiError("");
    setEditingId(null);
    router.refresh();
  }

  async function setEstado(id: string, estado: string) {
    await patchTramite(id, { estado });
  }

  async function confirmDeleteTramite() {
    if (!pendingDeleteId) return;
    setBusy(true);
    const result = await apiMutation(`/api/tramites/${pendingDeleteId}`, {
      method: "DELETE", headers: { "Idempotency-Key": keyFor({delete:pendingDeleteId}) },
    });
    setBusy(false);
    setPendingDeleteId(null);
    if (!result.ok) { setAiError(result.error); return; }
    setAiError("");
    router.refresh();
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const previous = tramites.find(item => item.id === id);
    const enteredDate = String(fd.get("fechaLimite") || "");
    const fechaLimite = previous && enteredDate === toDateInput(previous.fechaLimite)
      ? previous.fechaLimite ? new Date(previous.fechaLimite).toISOString() : null
      : enteredDate || null;
    await patchTramite(id, {
      titulo: fd.get("titulo"),
      detalle: fd.get("detalle") || null,
      fechaLimite,
      responsableId: String(fd.get("responsableId") || "") || null,
    });
  }

  async function applyTemplate() {
    if (!templateId) return;
    setBusy(true);
    const result = await apiMutation(`/api/causas/${causaId}/tramites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": keyFor({templateId}) },
      body: JSON.stringify({ action: "apply-template", templateId }),
    });
    setBusy(false);
    if (!result.ok) { setAiError(result.error); return; }
    keys.current.delete(JSON.stringify({templateId})); setAiError("");
    setTemplateId("");
    router.refresh();
  }

  async function applyAiTramites(result: AiActionResponse) {
    const data = result.data as {
      tramites?: Array<{ titulo?: string; detalle?: string; diasLimite?: number }>;
    } | null;
    const items = data?.tramites?.filter((t) => t.titulo?.trim()) || [];
    if (!items.length) return;
    setBusy(true); setAiError("");
    for (const item of items) {
      let fechaLimite: string | null = null;
      if (typeof item.diasLimite === "number" && item.diasLimite > 0) {
        const estimate = await apiMutation<{ vencimiento: string }>("/api/integrations/hermes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "estimate-plazo", desde: civilDateKey(new Date()), dias: item.diasLimite, tipoComputo: "habiles" }) });
        if (!estimate.ok) { setAiError(estimate.error); setBusy(false); return; }
        fechaLimite = estimate.data.vencimiento;
      }
      const created = await apiMutation(`/api/causas/${causaId}/tramites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": keyFor({ai:result, item}) },
        body: JSON.stringify({
          titulo: item.titulo,
          detalle: item.detalle || null,
          fechaLimite,
          estado: "pendiente",
        }),
      });
      if (!created.ok) { setAiError(created.error); setBusy(false); router.refresh(); return; }
    }
    setBusy(false);
    router.refresh();
  }

  function rowActions(t: Tramite) {
    return (
      <div className="flex flex-wrap gap-1">
        <Link className="btn btn-ghost text-xs" href={`/offline.html?kind=tramite&record=${encodeURIComponent(t.id)}`}>Preparar sin conexión</Link>
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
          onClick={() => setPendingDeleteId(t.id)}
        >
          {dict.common.delete}
        </button>
      </div>
    );
  }

  function editForm(t: Tramite) {
    if (editingId !== t.id) return null;
    return (
      <form
        onSubmit={(e) => void saveEdit(e, t.id)}
        className="mt-2 grid grid-cols-1 items-end gap-4 rounded-xl border border-dashed border-[var(--line)] p-2 sm:grid-cols-2"
      >
        <label className="block space-y-2 text-sm font-medium sm:col-span-2">
          <span>Trámite</span>
          <input
          className="input"
          disabled={busy}
          name="titulo"
          required
          defaultValue={t.titulo}
        />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Fecha límite</span>
          <input
          className="input"
          disabled={busy}
          type="date"
          name="fechaLimite"
          defaultValue={toDateInput(t.fechaLimite)}
        />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Responsable</span>
          <select
          className="select"
          disabled={busy}
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
        </label>
        <label className="block space-y-2 text-sm font-medium sm:col-span-2">
          <span>Detalle opcional</span>
          <input
          className="input"
          disabled={busy}
          name="detalle"
          defaultValue={t.detalle || ""}
          placeholder="Detalle opcional"
        />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
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
      {aiError && <p role="alert" className="text-sm text-[var(--danger)]">{aiError}</p>}
      <AiAssist
        action="causa.sugerir_tramites"
        causaId={causaId}
        label={t("ai.tramites.suggest")}
        showPreview={false}
        onResult={(r) => void applyAiTramites(r)}
      />
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-dashed border-[var(--line)] p-3">
        <label className="block w-full min-w-0 flex-1 text-sm sm:min-w-[220px]">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        className="grid grid-cols-1 items-end gap-4 rounded-2xl border border-dashed border-[var(--line)] p-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="block space-y-2 text-sm font-medium sm:col-span-2">
          <span>Trámite</span>
          <input
          className="input"
          name="titulo"
          disabled={busy || retryCreate}
          required
          placeholder="Nuevo trámite pendiente"
        />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Fecha límite</span>
          <input className="input" type="date" name="fechaLimite" disabled={busy || retryCreate} />
        </label>
        <button className="btn btn-primary" disabled={busy} type="submit">
          {retryCreate ? "Reintentar envío" : "Agregar"}
        </button>
        <label className="block space-y-2 text-sm font-medium sm:col-span-2">
          <span>Responsable</span>
          <select className="select" name="responsableId" defaultValue="" disabled={busy || retryCreate}>
          <option value="">Responsable (yo por defecto)</option>
          {responsables.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        </label>
        <label className="block space-y-2 text-sm font-medium sm:col-span-2">
          <span>Detalle opcional</span>
          <input
          className="input"
          name="detalle"
          disabled={busy || retryCreate}
          placeholder="Detalle opcional"
        />
        </label>
      </form>

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => void confirmDeleteTramite()}
        title={dict.confirm.deleteTramite}
        description={dict.confirm.deleteTramiteDesc}
        busy={busy}
      />
    </div>
  );
}
