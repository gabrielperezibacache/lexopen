"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { apiMutation } from "@/lib/api-mutation";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import { civilDateKey, formatCivilDate } from "@/lib/chile-time";
import { FISCALIA_PORTAL, FISCALIA_STATUSES, FISCALIA_KINDS, type FiscaliaState } from "@/lib/fiscalia/contract";

type Cause = { id: string; titulo: string; ruc: string | null; canEdit: boolean };
export type FiscaliaItem = { id: string; causaId: string; title: string; kind: keyof typeof FISCALIA_KINDS; body: string; ruc: string | null; status: FiscaliaState; folio: string | null; submittedAt: string | null; responseText: string; answeredAt: string | null; followUpDate: string | null; updatedAt: string; canEdit: boolean; causa: { id: string; titulo: string }; events: { id: string; action: string; status: FiscaliaState; createdAt: string; actor: { name: string } | null }[] };
const day = (value: string | null | undefined) => value ? civilDateKey(new Date(value)) : "";
function Editor({ item, causes, initialCaseId, userId, onSaved, onClose }: { item: FiscaliaItem | null; causes: Cause[]; initialCaseId: string; userId: string; onSaved: (status: FiscaliaState) => void; onClose: () => void }) {
  const [causaId, setCausaId] = useState(item?.causaId || initialCaseId);
  const [status, setStatus] = useState<FiscaliaState>(item?.status || "draft");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false), [uncertain, setUncertain] = useState(false);
  const keys = useRef(createSubmissionKeys(undefined, `fiscalia:${userId}:${item?.id || "new"}`));
  const attempt = useRef<{ key: string; payload: Record<string, unknown> } | null>(null);
  const locked = Boolean(item && ["submitted", "answered", "closed"].includes(item.status));
  const answered = Boolean(item && ["answered", "closed"].includes(item.status));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    if (!uncertain || !attempt.current) {
      const f = new FormData(event.currentTarget), text = (key: string) => String(f.get(key) || "").trim();
      const payload = { causaId, title: locked ? item!.title : text("title"), kind: locked ? item!.kind : text("kind"), body: locked ? item!.body : text("body"), ruc: (locked ? item!.ruc : text("ruc")) || null, status,
        folio: text("folio") || null, submittedAt: text("submittedAt") || null,
        responseText: answered ? item!.responseText : text("responseText"), answeredAt: (answered ? day(item!.answeredAt) : text("answeredAt")) || null,
        followUpDate: text("followUpDate") || null, portalConfirmed: f.get("portalConfirmed") === "on",
        ...(item ? { id: item.id, expectedUpdatedAt: item.updatedAt } : {}) };
      attempt.current = { key: keys.current.forPayload(payload), payload };
    }
    setSaving(true); setError("");
    const pending = attempt.current;
    const response = await apiMutation<{ id: string }>("/api/fiscalia/solicitudes", { method: item ? "PATCH" : "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": pending.key }, body: JSON.stringify(pending.payload) });
    setSaving(false);
    if (!response.ok) {
      const unknown = uncertain || response.status === 0 || response.status === 408 || response.status >= 500;
      setUncertain(unknown); setError(unknown ? "No se pudo confirmar el guardado. Reintente para comprobarlo sin duplicar la solicitud." : response.error); return;
    }
    if (!response.data.id) { setUncertain(true); setError("El servidor no confirmó el guardado. Reintente para comprobarlo."); return; }
    keys.current.complete(pending.payload); onSaved(status);
  }
  const options: FiscaliaState[] = !item ? ["draft", "ready"] : item.status === "draft" ? ["draft", "ready", "cancelled"] : item.status === "ready" ? ["draft", "ready", "submitted", "cancelled"] : item.status === "submitted" ? ["submitted", "answered", "closed"] : item.status === "answered" ? ["answered", "closed"] : ["closed"];
  return <form onSubmit={save} className="space-y-4 p-4">
    <p className="text-sm text-[var(--muted)]">Guardar aquí prepara y registra la gestión. La presentación se realiza en el portal oficial con tu ClaveÚnica.</p>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    <fieldset disabled={saving || uncertain} className="space-y-4">
      <legend className="sr-only">Datos de la solicitud</legend>
      <label className="block text-sm">Causa<select aria-label="Causa" className="select mt-1" value={causaId} disabled={Boolean(item)} required onChange={e => setCausaId(e.target.value)}><option value="">Seleccionar causa</option>{causes.filter(c => c.canEdit || c.id === item?.causaId).map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}</select></label>
      <label className="block text-sm">Asunto<input className="input mt-1" name="title" required minLength={3} maxLength={300} defaultValue={item?.title} readOnly={locked} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">Tipo<select aria-label="Tipo" className="select mt-1" name="kind" defaultValue={item?.kind || "informacion"} disabled={locked}>{Object.entries(FISCALIA_KINDS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="block text-sm">RUC (por confirmar)<input key={causaId} className="input mt-1" name="ruc" maxLength={40} defaultValue={item?.ruc || causes.find(c => c.id === causaId)?.ruc || ""} readOnly={locked} /></label>
      </div>
      <label className="block text-sm">Contenido<textarea aria-label="Contenido" className="textarea mt-1" name="body" rows={7} maxLength={20000} defaultValue={item?.body} readOnly={locked} /></label>
      {locked && <p className="text-xs text-[var(--muted)]">Se conserva el contenido presentado. Para otra gestión, crea una nueva solicitud.</p>}
      <label className="block text-sm">Estado<select aria-label="Estado" className="select mt-1" value={status} onChange={e => setStatus(e.target.value as FiscaliaState)}>{options.map(k => <option key={k} value={k}>{FISCALIA_STATUSES[k]}</option>)}</select></label>
      {["submitted", "answered", "closed"].includes(status) && <div className="space-y-3 border-t border-[var(--line)] pt-3">
        <label className="block text-sm">Folio del comprobante<input className="input mt-1" name="folio" maxLength={120} required defaultValue={item?.folio || ""} /></label>
        <label className="block text-sm">Fecha de presentación<input className="input mt-1" type="date" name="submittedAt" required defaultValue={day(item?.submittedAt)} /></label>
        {item?.status === "ready" && <label className="flex gap-2 text-sm"><input type="checkbox" name="portalConfirmed" required /> Confirmo que la presenté en Mi Fiscalía y tengo su comprobante.</label>}
      </div>}
      {(status === "answered" || answered) && <div className="space-y-3">
        <label className="block text-sm">Respuesta recibida<textarea aria-label="Respuesta recibida" className="textarea mt-1" name="responseText" rows={4} maxLength={20000} defaultValue={item?.responseText} required={status === "answered"} readOnly={answered} /></label>
        <label className="block text-sm">Fecha de respuesta<input className="input mt-1" name="answeredAt" type="date" defaultValue={day(item?.answeredAt)} required={status === "answered"} readOnly={answered} /></label>
      </div>}
      <label className="block text-sm">Fecha para revisar el seguimiento<input className="input mt-1" name="followUpDate" aria-label="Fecha para revisar el seguimiento" type="date" defaultValue={day(item?.followUpDate)} /><span className="mt-1 block text-xs text-[var(--muted)]">Recordatorio del estudio; no es un plazo legal ni una respuesta garantizada.</span></label>
    </fieldset>
    <div className="flex flex-wrap justify-end gap-2"><button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="btn btn-primary" disabled={saving} type="submit">{saving ? "Guardando…" : uncertain ? "Reintentar guardado" : "Guardar solicitud"}</button></div>
  </form>;
}

export function FiscaliaWorkspace({ rows, causes, truncated, userId, causaId = "", status = "open" }: { rows: FiscaliaItem[]; causes: Cause[]; truncated: boolean; userId: string; causaId?: string; status?: string }) {
  const router = useRouter(); const [editor, setEditor] = useState<FiscaliaItem | "new" | null>(null), [notice, setNotice] = useState("");
  return <div className="space-y-5 break-words" data-testid="fiscalia-workspace">
    <section className="panel space-y-3 rounded-[var(--radius-lg)] p-5"><h2 className="font-semibold">Ingresar con tu misma ClaveÚnica</h2><p className="max-w-prose text-sm">Usa tu identidad del Registro Civil, como en OJV. El ingreso se completa en Mi Fiscalía; cada portal mantiene su propia sesión y verifica tu calidad de interviniente o representante.</p><a className="btn btn-secondary" href={FISCALIA_PORTAL} target="_blank" rel="noopener noreferrer">Abrir Mi Fiscalía con ClaveÚnica</a><p className="text-xs text-[var(--muted)]">LexOpen no solicita otra contraseña ni confirma la disponibilidad del portal. Si no responde, tus borradores permanecen guardados.</p></section>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[var(--muted)]">Preparar → presentar en el portal → registrar folio → seguir respuesta.</p>{causes.some(c => c.canEdit) && <button className="btn btn-primary" onClick={() => setEditor("new")}>Nueva solicitud</button>}</div>
    <form method="GET" className="panel flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] p-4" aria-label="Filtros de solicitudes">
      <label className="min-w-0 flex-1 text-sm">Causa<select aria-label="Causa" className="select mt-1" name="causaId" defaultValue={causaId}><option value="">Todas las causas accesibles</option>{causes.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}</select></label>
      <label className="text-sm">Estado<select aria-label="Estado" className="select mt-1" name="status" defaultValue={status}><option value="open">Abiertas</option><option value="all">Todas</option>{Object.entries(FISCALIA_STATUSES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label><button className="btn btn-secondary">Aplicar filtros</button><Link className="btn btn-ghost" href="/mi-fiscalia">Limpiar</Link>
    </form>
    {notice && <p role="status" className="text-sm text-[var(--sea)]">{notice}</p>}{truncated && <p className="text-sm">Se muestran las primeras 100 solicitudes. Acota los filtros para consultar las demás.</p>}
    {!rows.length && <div className="panel rounded-[var(--radius-lg)] p-5"><h2 className="font-semibold">Sin solicitudes con estos filtros</h2><p className="mt-2 text-sm">Prepara una solicitud y vincúlala con su causa para conservar su seguimiento.</p></div>}
    <ul className="space-y-3" aria-label="Solicitudes a Mi Fiscalía">{rows.map(row => <li key={row.id} className="panel min-w-0 space-y-3 rounded-[var(--radius-lg)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{row.title}</h2><p className="mt-1 text-sm">{FISCALIA_STATUSES[row.status]} · {FISCALIA_KINDS[row.kind]}</p><Link className="break-words text-sm text-[var(--sea)]" href={`/causas/${row.causaId}`}>{row.causa.titulo}</Link><p className="text-sm">RUC: {row.ruc || "Por confirmar"}{row.folio ? ` · Folio registrado: ${row.folio}` : ""}</p></div><div className="flex flex-wrap gap-2"><a className="btn btn-secondary" href={`/api/fiscalia/solicitudes/${row.id}/export`} download>Descargar preparación</a>{row.canEdit && !["closed", "cancelled"].includes(row.status) && <button className="btn btn-ghost" onClick={() => setEditor(row)} aria-label={`Editar ${row.title}`}>Editar seguimiento</button>}</div></div>
      {row.followUpDate && <p className="text-sm font-medium">Revisar seguimiento: {formatCivilDate(row.followUpDate)}</p>}
      {row.submittedAt && <p className="text-xs text-[var(--muted)]">Presentación registrada por el usuario: {formatCivilDate(row.submittedAt)}. No sincronizada con el portal.</p>}
      <details><summary className="cursor-pointer py-2 text-sm font-medium">Contenido e historial</summary><p className="whitespace-pre-wrap break-words text-sm">{row.body || "Borrador sin contenido."}</p>{row.responseText && <div className="mt-3"><h3 className="text-sm font-medium">Respuesta registrada</h3><p className="whitespace-pre-wrap break-words text-sm">{row.responseText}</p></div>}<ol className="mt-3 space-y-1 text-xs text-[var(--muted)]">{row.events.map(e => <li key={e.id}>{formatCivilDate(e.createdAt)} · {e.actor?.name || "Usuario anterior"} · {FISCALIA_STATUSES[e.status]}</li>)}</ol><p className="mt-1 text-xs">Últimos 15 cambios registrados.</p></details>
    </li>)}</ul>
    <Dialog open={editor !== null} title={editor === "new" ? "Nueva solicitud a Mi Fiscalía" : "Seguimiento de solicitud"} onClose={() => setEditor(null)} className="w-[min(44rem,calc(100vw-1.5rem))]">{editor && <Editor key={editor === "new" ? "new" : editor.id} item={editor === "new" ? null : editor} causes={causes} initialCaseId={causaId} userId={userId} onClose={() => setEditor(null)} onSaved={savedStatus => { setEditor(null); setNotice(savedStatus === "cancelled" ? "Borrador descartado. Se conserva su historial." : savedStatus === "submitted" ? "Presentación registrada por el usuario. Conserva el comprobante oficial." : savedStatus === "ready" ? "Solicitud lista para presentar en el portal oficial." : "Solicitud guardada en LexOpen."); router.refresh(); }} />}</Dialog>
  </div>;
}
