"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
import { operationKey } from "@/lib/client-submission-key";
import { COMPUTER_AUTHORIZATION_MODE_OPTIONS, COMPUTER_AUTHORIZATION_PERMISSION_LABELS, COMPUTER_GUI_EFFECTS_ACKNOWLEDGEMENT, COMPUTER_BROWSER_EFFECTS_NOTICE, DEFAULT_COMPUTER_AUTHORIZATION, computerAuthorizationModePresentation, type ComputerAuthorizationMode } from "@/lib/altazor/computer/authorization-policy";
import type { ComputerAuthorizationSettings as Settings, ComputerAuthorizationView } from "@/lib/altazor/computer/types";
import styles from "./ComputerAuthorizationSettings.module.css";

type Reply = { workspaces: { id: string; label: string; causaId: string | null }[]; authorization: ComputerAuthorizationView | null; localConfiguration: boolean };
const endpoint = "/api/altazor/computer/authorization";
const states = { default: "Aún no has elegido autorizaciones", saved: "Guardado para el próximo escritorio", applied: "Aplicado y confirmado por el escritorio", unknown: "Resultado sin confirmar", unsupported: "El escritorio necesita una actualización", mismatch: "Las autorizaciones del escritorio necesitan revisión" };

export function ComputerAuthorizationSettings({ workspaceId: pinned }: { workspaceId?: string }) {
  const uid = useId(), requestVersion = useRef(0);
  const [data, setData] = useState<Reply | null>(null), [selected, setSelected] = useState(pinned ?? "");
  const [form, setForm] = useState<Settings>({ ...DEFAULT_COMPUTER_AUTHORIZATION });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false), [guiAcknowledged, setGuiAcknowledged] = useState(false);
  const refresh = useCallback(async (id: string, signal?: AbortSignal) => {
    const version = ++requestVersion.current;
    const response = await fetch(`${endpoint}${id ? `?${new URLSearchParams({ workspaceId: id })}` : ""}`, { cache: "no-store", signal });
    const reply = await response.json();
    if (signal?.aborted || version !== requestVersion.current) return;
    if (!response.ok) throw new Error(reply.error || "No se pudieron comprobar las autorizaciones.");
    const value = reply as Reply; setData(value); setForm(value.authorization?.desired ?? { ...DEFAULT_COMPUTER_AUTHORIZATION }); setConfirmed(false); setGuiAcknowledged(false);
    return value;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const requested = selected || pinned || new URLSearchParams(location.search).get("escritorioEspacio") || "";
    void refresh(requested, controller.signal).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudieron comprobar las autorizaciones."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [pinned, refresh, selected]);
  const view = data?.authorization, editable = Boolean(view?.canConfigure && data?.localConfiguration);
  const change = (value: Partial<Settings>) => { setForm(current => ({ ...current, ...value })); setConfirmed(false); setGuiAcknowledged(false); setNotice(""); };
  function mode(value: ComputerAuthorizationMode) { change({ mode: value, allowInput: false, allowBrowser: false, allowApps: false }); }
  async function save() {
    if (!view || !confirmed || !editable || busy || form.allowInput && !guiAcknowledged) return;
    setBusy(true); setError(""); setNotice("");
    const result = await apiMutation<{ authorization: ComputerAuthorizationView; status: string }>(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: view.workspaceId, requestId: operationKey(), choice: { ...form, expectedRevision: view.revision, confirmed: true, ...(form.allowInput ? { guiEffectsAcknowledged: true } : {}) } }) });
    if (!result.ok) { setError(`${result.error} No se repetirá el cambio automáticamente.`); await refresh(view.workspaceId).catch(() => {}); }
    else { setData(current => current ? { ...current, authorization: result.data.authorization } : current); setNotice(states[result.data.authorization.state]); setConfirmed(false); setGuiAcknowledged(false); }
    setBusy(false);
  }
  return <section id="autorizaciones-escritorio" className={`panel ${styles.root}`} aria-labelledby={`${uid}-title`}>
    <header><h3 id={`${uid}-title`}>Autorizaciones del escritorio</h3><p>Elige cómo puede usar Altazor su computador. Estos permisos pertenecen a tu usuario y al espacio seleccionado.</p></header>
    {loading && <p role="status">Comprobando autorizaciones…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {!loading && data && !data.workspaces.length && <p>Prepara primero el escritorio de Altazor para elegir sus autorizaciones. <Link href="/inicio?altazor=computer">Abrir escritorio</Link></p>}
    {data && data.workspaces.length > 0 && <>
      {!pinned && <div className={styles.scope}><label htmlFor={`${uid}-workspace`}>Espacio de trabajo</label><select id={`${uid}-workspace`} value={view?.workspaceId ?? selected} disabled={busy} onChange={event => { setSelected(event.target.value); setLoading(true); setError(""); setData(null); setConfirmed(false); setGuiAcknowledged(false); }}>{data.workspaces.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select></div>}
      {view && <>
        <div className={styles.current} role="status"><strong>{states[view.state]}</strong>{view.applied?.applied ? <p>En el escritorio: {computerAuthorizationModePresentation(view.applied.mode).label} · revisión {view.applied.revision}. Acciones: {view.applied.actionsUsed}/{view.applied.maxActions}. Consultas: {view.applied.consultationsUsed}/{view.applied.maxConsultations}.</p> : <p>Sin una elección aplicada, el escritorio permite observar y tomar el control manual; no se conceden permisos nuevos.</p>}{view.reason && <p>{view.reason}</p>}</div>
        <form onSubmit={event => { event.preventDefault(); void save(); }}>
          <fieldset disabled={!editable || busy || loading}><legend>Modo de trabajo</legend><div className={styles.modes}>{COMPUTER_AUTHORIZATION_MODE_OPTIONS.map(value => { const copy = computerAuthorizationModePresentation(value); return <label key={value}><input type="radio" name={`${uid}-mode`} value={value} checked={form.mode === value} onChange={() => mode(value)} /><span><strong>{copy.label}{copy.recommended && <small>Recomendado</small>}</strong><span>{copy.description}</span></span></label>; })}</div></fieldset>
          <fieldset disabled={!editable || busy || loading || form.mode !== "autonomous"}><legend>Permisos para Trabajo autónomo</legend><p>Activa sólo las categorías que quieras permitir. En Consultas inteligentes, las acciones de efecto desconocido siguen consultándose.</p>{Object.entries(COMPUTER_AUTHORIZATION_PERMISSION_LABELS).map(([field, label]) => <label className={styles.check} key={field}><input type="checkbox" checked={form[field as "allowInput" | "allowBrowser" | "allowApps"]} onChange={event => change({ [field]: event.target.checked })} /><span>{label}</span></label>)}</fieldset>
          {form.allowInput && <label className={styles.check}><input type="checkbox" checked={guiAcknowledged} disabled={!editable || busy} onChange={event => setGuiAcknowledged(event.target.checked)} /><span>{COMPUTER_GUI_EFFECTS_ACKNOWLEDGEMENT}</span></label>}
          {form.allowBrowser && <p className={styles.warning}>{COMPUTER_BROWSER_EFFECTS_NOTICE}</p>}
          <details className={styles.limits}><summary>Límites de la sesión</summary><div><label htmlFor={`${uid}-actions`}>Máximo de acciones</label><input id={`${uid}-actions`} type="number" min={1} max={1000} value={form.maxActions} disabled={!editable || busy} onChange={event => change({ maxActions: Number(event.target.value) })} /><label htmlFor={`${uid}-consultations`}>Máximo de consultas</label><input id={`${uid}-consultations`} type="number" min={1} max={100} value={form.maxConsultations} disabled={!editable || busy} onChange={event => change({ maxConsultations: Number(event.target.value) })} /></div></details>
          <p>Los comandos, las instalaciones, los secretos y las conexiones mantienen sus controles propios. El monitor y Tomar control siguen disponibles.</p>
          <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={!editable || busy} onChange={event => setConfirmed(event.target.checked)} /><span>Confirmo esta elección y estas categorías para mi escritorio de este espacio.</span></label>
          <div className={styles.actions}><button className="btn btn-primary" type="submit" disabled={!editable || busy || !confirmed || form.allowInput && !guiAcknowledged}>{busy ? "Comprobando aplicación…" : view.sessionId ? "Guardar y aplicar" : "Guardar para el próximo escritorio"}</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void refresh(view.workspaceId).catch(cause => setError(cause instanceof Error ? cause.message : "No se pudo comprobar el estado."))}>Comprobar estado</button><Link className="btn btn-ghost" href={`/inicio?altazor=computer${view.sessionId ? `&escritorio=${encodeURIComponent(view.sessionId)}` : ""}`}>Ver escritorio</Link></div>
        </form>
      </>}
    </>}
  </section>;
}
