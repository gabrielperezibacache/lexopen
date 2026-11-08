"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";

type Account = "study" | "personal" | "altazor";
type State = {
  enabled: boolean; intervalMinutes: number; lastRunAt: string | null; status: string; note: string | null; canConfigure: boolean; account: Account;
  connectionId?: string | null; bindingRevision?: string | null; folderId?: string; generation?: number;
  accounts: { study: { configured: boolean }; personal: { connected: boolean; label: string; reason: string | null }; altazor?: { connected: boolean; canManage: boolean; reason: string | null } };
};
export function DriveAutoSyncPanel({ causaId, canConfigure }: { causaId: string; canConfigure: boolean }) {
  const endpoint = `/api/integrations/google/drive/${encodeURIComponent(causaId)}/sync`;
  const [state, setState] = useState<State | null>(null), [minutes, setMinutes] = useState(60), [account, setAccount] = useState<Account>("study"), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("No se pudo consultar la sincronización.");
      const value = await response.json() as State;
      if (!controller.signal.aborted) { setState(value); setMinutes(value.intervalMinutes); setAccount(value.account); }
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [endpoint]);
  useEffect(() => {
    if (!state?.enabled) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => { if (response.ok && !controller.signal.aborted) setState(await response.json() as State); }).catch(() => undefined);
    }, 8_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [endpoint, state?.enabled]);
  const activeAccount = state?.account === "altazor" ? "altazor" : state?.enabled ? state.account : account;
  const connected = Boolean(state?.accounts && (activeAccount === "altazor" ? state.accounts.altazor?.connected : activeAccount === "personal" ? state.accounts.personal.connected : state.accounts.study.configured));
  async function save(enabled: boolean, useDraft = true) {
    if (!state || busy) return;
    setBusy(true); setMessage("");
    const selected = state.account === "altazor" ? "altazor" : useDraft ? account : state.account;
    const expected = selected === "altazor" ? { connectionId: state.connectionId, bindingRevision: state.bindingRevision, folderId: state.folderId, generation: state.generation } : {};
    const response = await apiMutation<State>(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, intervalMinutes: useDraft ? minutes : state.intervalMinutes, account: selected, ...expected }) });
    setBusy(false);
    if (!response.ok) { setMessage(response.error); return; }
    setState(response.data); setAccount(response.data.account); setMessage(enabled ? "Recepción automática activada. Estamos revisando esta carpeta." : "Recepción automática pausada.");
  }
  return <div className="mt-4 border-t border-[var(--line)] pt-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Recibir novedades de Drive</h3><p className="mt-1 text-sm text-[var(--ink-soft)]">{activeAccount === "altazor" ? "La cuenta de Google conectada a Altazor" : activeAccount === "personal" ? "Mi Google Drive (conexión anterior)" : "Google Drive del estudio"}</p></div><span className="badge">{state ? state.enabled ? ["attention", "partial"].includes(state.status) ? "Por revisar" : "Activa" : "En pausa" : "Comprobando…"}</span></div>
    <p className="mt-2 text-sm text-[var(--ink-soft)]">Recibe archivos y versiones nuevas en el expediente. Los cambios que prepares se guardan en Drive desde cada documento.</p>
    {canConfigure && state?.canConfigure && <>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn btn-primary" disabled={busy || !connected} onClick={() => void save(true, !state.enabled)}><RefreshCw size={15} aria-hidden="true" />{busy ? "Guardando…" : state.enabled ? "Recibir ahora" : "Activar recepción automática"}</button>{state.enabled && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void save(false, false)}>Pausar</button>}</div>
      <details className="mt-3 text-sm"><summary className="flex min-h-11 cursor-pointer items-center text-[var(--ink-soft)] underline underline-offset-4">Frecuencia y opciones</summary><div className="mt-2 grid gap-3">
        {activeAccount !== "altazor" && <label>Conexión anterior<select className="input mt-1" value={account} disabled={busy} onChange={event => setAccount(event.target.value as Account)}><option value="study">Google del estudio</option><option value="personal">Mi Google Drive personal</option></select></label>}
        <label>Revisar<select className="input mt-1" value={minutes} disabled={busy} onChange={event => setMinutes(Number(event.target.value))}>{[[15, "Cada 15 minutos"], [30, "Cada 30 minutos"], [60, "Cada hora"], [180, "Cada 3 horas"], [360, "Cada 6 horas"], [1440, "Una vez al día"]].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <p className="text-sm text-[var(--ink-soft)]">Incluye subcarpetas. Las revisiones se conservan por separado para mantener las fuentes y citas.</p>
        {state.enabled && <button type="button" className="btn btn-secondary justify-self-start" disabled={busy || !connected} onClick={() => void save(true)}>Guardar frecuencia</button>}
      </div></details>
    </>}
    {state && !connected && <p className="mt-3 text-sm">{activeAccount === "altazor" ? state.accounts.altazor?.reason || "Revisa la cuenta de Google conectada a Altazor." : activeAccount === "personal" ? state.accounts.personal.reason || "Revisa tu conexión personal anterior." : "La cuenta del estudio está pendiente de conexión."} <Link className="underline underline-offset-4" href={activeAccount === "personal" ? "/conexiones" : "/inicio?altazor=connectors&connector=google"}>Revisar conexión</Link></p>}
    {state && !state.canConfigure && <p className="mt-3 text-sm text-[var(--ink-soft)]">La gestiona el profesional que la activó.</p>}
    {state?.lastRunAt && <p className="mt-3 text-sm text-[var(--ink-soft)]">Última revisión: {new Date(state.lastRunAt).toLocaleString("es-CL")}.</p>}
    {state?.note && ["attention", "partial"].includes(state.status) && <p className="mt-2 text-sm" role="status">{state.note}</p>}
    {message && <p className="mt-3 text-sm" role="status">{message}</p>}
  </div>;
}
