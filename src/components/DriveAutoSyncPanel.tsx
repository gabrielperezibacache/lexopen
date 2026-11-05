"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";

type State = { enabled: boolean; intervalMinutes: number; lastRunAt: string | null; status: string; note: string | null; canConfigure: boolean; account: "study" | "personal"; accounts: { study: { configured: boolean }; personal: { connected: boolean; label: string; reason: string | null } } };
export function DriveAutoSyncPanel({ causaId, canConfigure }: { causaId: string; canConfigure: boolean }) {
  const endpoint = `/api/integrations/google/drive/${encodeURIComponent(causaId)}/sync`;
  const [state, setState] = useState<State | null>(null), [minutes, setMinutes] = useState(60), [account, setAccount] = useState<"study" | "personal">("study"), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => { if (!response.ok) throw new Error("No se pudo consultar la sincronización."); const value = await response.json() as State; setState(value); setMinutes(value.intervalMinutes); setAccount(value.account); }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [endpoint]);
  useEffect(() => {
    if (!state?.enabled) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => { if (response.ok) setState(await response.json() as State); }).catch(() => undefined);
    }, 8_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [endpoint, state?.enabled]);
  async function save(enabled: boolean, useDraft = true) {
    setBusy(true); setMessage("");
    const response = await apiMutation<State>(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, intervalMinutes: useDraft ? minutes : state?.intervalMinutes ?? minutes, account: useDraft ? account : state?.account ?? account }) });
    setBusy(false);
    if (!response.ok) { setMessage(response.error); return; }
    setState(response.data); setMessage(enabled ? "Actualización automática activada. Estamos revisando esta carpeta." : "Actualización automática pausada.");
  }
  const activeAccount = state?.enabled ? state.account : account;
  return <div className="mt-4 border-t border-[var(--line)] pt-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Actualización automática</h3><p className="mt-1 text-sm text-[var(--ink-soft)]">{activeAccount === "personal" ? "Mi Google Drive" : "Google Drive del estudio"}</p></div><span className="badge">{state ? state.enabled ? ["attention","partial"].includes(state.status) ? "Por revisar" : "Activa" : "En pausa" : "Comprobando…"}</span></div>
    {canConfigure && state?.canConfigure && <>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn btn-primary" disabled={busy || !state.accounts || (activeAccount === "personal" ? !state.accounts.personal.connected : !state.accounts.study.configured)} onClick={() => void save(true, !state.enabled)}><RefreshCw size={15} aria-hidden="true" />{busy ? "Guardando…" : state.enabled ? "Actualizar ahora" : "Activar actualización automática"}</button>{state.enabled && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void save(false, false)}>Pausar</button>}</div>
      <details className="mt-3 text-sm"><summary className="flex min-h-11 cursor-pointer items-center text-[var(--ink-soft)] underline underline-offset-4">Configurar sincronización</summary><div className="mt-2 grid gap-3"><label>Cuenta<select className="input mt-1" value={account} disabled={busy} onChange={event => setAccount(event.target.value as "study" | "personal")}><option value="study">Google del estudio</option><option value="personal">Mi Google Drive personal</option></select></label><label>Revisar<select className="input mt-1" value={minutes} disabled={busy} onChange={event => setMinutes(Number(event.target.value))}>{[[15,"Cada 15 minutos"],[30,"Cada 30 minutos"],[60,"Cada hora"],[180,"Cada 3 horas"],[360,"Cada 6 horas"],[1440,"Una vez al día"]].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><p className="text-xs text-[var(--ink-soft)]">Incluye subcarpetas y versiones nuevas. Cada copia conserva el original.</p>{state.enabled && <button type="button" className="btn btn-secondary justify-self-start" disabled={busy || (account === "personal" ? !state.accounts.personal.connected : !state.accounts.study.configured)} onClick={() => void save(true)}>Guardar cambios</button>}</div></details>
    </>}
    {account === "personal" && state && !state.accounts?.personal.connected && <p className="mt-3 text-sm"><Link className="underline underline-offset-4" href="/conexiones">Conectar mi Google Drive</Link></p>}
    {account === "study" && state && !state.accounts?.study.configured && <p className="mt-3 text-sm">La cuenta del estudio está pendiente de conexión.</p>}
    {state && !state.canConfigure && <p className="mt-3 text-sm text-[var(--ink-soft)]">La gestiona el profesional que la activó.</p>}
    {state?.lastRunAt && <p className="mt-3 text-xs text-[var(--ink-soft)]">Última revisión: {new Date(state.lastRunAt).toLocaleString("es-CL")}.</p>}
    {state?.note && ["attention","partial"].includes(state.status) && <p className="mt-2 text-sm" role="status">{state.note}</p>}
    {message && <p className="mt-3 text-sm" role="status">{message}</p>}
  </div>;
}
