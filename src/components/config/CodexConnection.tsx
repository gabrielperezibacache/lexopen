"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Check, ExternalLink, Link2, RefreshCw, Unplug } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import type { CodexConnectionStatus } from "@/lib/integrations/codex-session";
import "./CodexConnection.css";

type Preference = { enabled: boolean; model: string };
type State = { connection: CodexConnectionStatus; preference: Preference; canUse: boolean; remoteAllowed: boolean };
type Model = { id: string; displayName: string; isDefault?: boolean };
async function readConnection(signal?: AbortSignal): Promise<State> {
  const response = await fetch("/api/integrations/codex", { cache: "no-store", signal });
  const value = await response.json();
  if (!response.ok) throw Error(value.error || "No se pudo consultar la conexión de Codex.");
  return value;
}
const requestModels = (signal?: AbortSignal) => apiMutation<{ models: Model[] }>("/api/integrations/codex", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "models" }), signal });

export function CodexConnection() {
  const id = useId(), [data, setData] = useState<State>(), [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState(""), [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const apply = useCallback((value: State) => { setData(value); setModel(value.preference.model); setEnabled(value.preference.enabled); }, []);
  const refresh = useCallback(async (initial = false, signal?: AbortSignal) => {
    try {
      const value = await readConnection(signal);
      if (signal?.aborted) return;
      if (initial) apply(value); else setData(value);
      setError("");
    } catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "No se pudo consultar la conexión."); }
  }, [apply]);
  useEffect(() => {
    const control = new AbortController();
    void readConnection(control.signal).then(value => { if (!control.signal.aborted) { apply(value); setError(""); } }).catch(reason => { if (!control.signal.aborted) setError(reason instanceof Error ? reason.message : "No se pudo consultar la conexión."); });
    return () => control.abort();
  }, [apply]);
  const pending = Boolean(data?.connection.pendingLogin), connected = Boolean(data?.connection.connected);
  const canActivate = Boolean(data?.canUse && data.remoteAllowed);
  useEffect(() => { if (!pending) return; const control = new AbortController(), timer = setInterval(() => { void refresh(false, control.signal); }, 5000); return () => { clearInterval(timer); control.abort(); }; }, [pending, refresh]);
  const acceptModels = useCallback((result: Awaited<ReturnType<typeof requestModels>>) => {
    if (!result.ok) { setError(result.error); return; }
    setModels(result.data.models);
    setModel(previous => previous || result.data.models.find(item => item.isDefault)?.id || result.data.models[0]?.id || "");
  }, []);
  async function loadModels() { acceptModels(await requestModels()); }
  useEffect(() => {
    if (!connected || !canActivate) return;
    const control = new AbortController();
    void requestModels(control.signal).then(result => { if (!control.signal.aborted) acceptModels(result); });
    return () => control.abort();
  }, [connected, canActivate, acceptModels]);
  async function action(name: "connect" | "cancel" | "disconnect" | "save" | "test" | "disable") {
    setBusy(name); setError(""); setNotice("");
    try {
      const result = await apiMutation<State & { ok?: boolean; preview?: string }>("/api/integrations/codex", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name === "disable" ? "save" : name, ...(name === "save" || name === "disable" ? { model, enabled: name === "disable" ? false : enabled } : name === "test" ? { model } : {}) }) });
      if (!result.ok) { setError(result.error); if (name === "disconnect") await refresh(true); return; }
      if (name === "test") setNotice(`Codex respondió con ${model}. ${result.data.preview || ""}`);
      else { apply(result.data); if (name === "save" || name === "disable") setNotice("Preferencia guardada. Se aplicará a tus próximas solicitudes de IA."); if (name === "disconnect") { setModels([]); setNotice("Cuenta desconectada. Tu uso personal de Codex quedó desactivado."); } }
    } finally { setBusy(""); }
  }
  return <section id="codex" className="codex-connection" aria-labelledby={`${id}-title`}>
    <header><div><h2 id={`${id}-title`}>Tu cuenta de Codex</h2><p>Conecta tu cuenta de ChatGPT/Codex para redactar y conversar con las fuentes que elijas en LexOpen.</p></div><Link2 size={28} strokeWidth={1.5} aria-hidden="true" /></header>
    <p className="codex-help">La conexión pertenece a tu usuario en este Host. Cada profesional conserva su propia cuenta; el acceso a las causas y los libros sigue dependiendo de sus permisos.</p>
    <p className="codex-help">Mientras tu conexión personal esté desactivada, se utiliza la configuración de IA del estudio.</p>
    {error && <div className="codex-message" data-error="true" role="alert"><p>{error}</p><button type="button" className="codex-text-action" disabled={Boolean(busy)} onClick={() => void refresh(!data)}>Volver a consultar conexión</button></div>}
    {!data && !error && <p role="status">Consultando tu conexión…</p>}
    {data && <>
      <div className="codex-account-state" role="status"><strong>{connected ? "Cuenta conectada" : pending ? "Autorización pendiente" : data.connection.status === "error" ? "No se pudo comprobar la cuenta" : data.connection.available ? "Cuenta sin conectar" : "Codex necesita preparación en el Host"}</strong><span>{data.connection.account?.email || data.connection.note || "Conecta la cuenta que quieras utilizar en este equipo."}</span></div>
      {connected && <p className="codex-help">{data.connection.account?.planType && <>Plan informado por Codex: <strong>{data.connection.account.planType}</strong>. </>}La autorización de la cuenta no comprueba el acceso al modelo ni la cuota disponible. Usa «Probar conexión» para verificar una respuesta real con el modelo elegido.</p>}
      {!data.canUse && <p className="codex-message" role="status">Tu usuario no tiene permiso para usar IA. Puedes desactivar o desconectar tu cuenta personal; el administrador del estudio gestiona ese permiso.</p>}
      {!data.remoteAllowed && <p className="codex-message">El estudio permite sólo IA local. Codex envía las solicitudes a OpenAI y queda desactivado bajo esa política.</p>}
      {data.preference.enabled && (!connected || !canActivate) && <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => void action("disable")}>Desactivar mi Codex personal</button>}
      {!connected && !pending && <button type="button" className="btn btn-primary" disabled={Boolean(busy) || !data.connection.available || !canActivate} onClick={() => void action("connect")}><Link2 size={16} aria-hidden="true" />{busy === "connect" ? "Preparando autorización…" : "Conectar cuenta de ChatGPT/Codex"}</button>}
      {data.connection.pendingLogin && <div className="codex-authorize"><h3>Autoriza esta conexión</h3><p>Abre la página de OpenAI e introduce este código. LexOpen confirmará la conexión cuando termines.</p><code aria-label="Código de autorización">{data.connection.pendingLogin.userCode}</code><a href={data.connection.pendingLogin.verificationUrl} target="_blank" rel="noreferrer" className="btn btn-primary">Continuar en OpenAI<ExternalLink size={16} aria-hidden="true" /></a><button type="button" className="codex-text-action" disabled={Boolean(busy)} onClick={() => void action("cancel")}>Cancelar autorización</button></div>}
      {connected && <div className="codex-preferences">
        <label htmlFor={`${id}-model`}>Modelo de tu conexión<select className="select" id={`${id}-model`} value={model} disabled={Boolean(busy) || !canActivate} onChange={event => { setModel(event.target.value); setNotice(""); }}><option value="">Elige un modelo</option>{model && !models.some(item => item.id === model) && <option value={model}>{model} · volver a comprobar</option>}{models.map(item => <option key={item.id} value={item.id}>{item.displayName || item.id}</option>)}</select></label>
        <button type="button" className="codex-text-action" disabled={Boolean(busy) || !canActivate} onClick={() => void loadModels()}><RefreshCw size={15} aria-hidden="true" />Actualizar modelos</button>
        <label className="codex-check"><input type="checkbox" checked={enabled} disabled={Boolean(busy) || !canActivate && !enabled} onChange={event => setEnabled(event.target.checked)} /><span>Usar mi Codex en las próximas solicitudes de IA</span></label>
        <p className="codex-help">El catálogo no garantiza acceso a todos los modelos. «Probar conexión» envía un mensaje breve sin documentos para comprobar el modelo elegido. Si activas tu conexión, los textos y pasajes seleccionados se enviarán a OpenAI conforme a la política del estudio.</p>
        <div className="codex-actions"><button type="button" className="btn btn-primary" disabled={Boolean(busy) || enabled && (!model || !canActivate)} onClick={() => void action("save")}><Check size={16} aria-hidden="true" />{busy === "save" ? "Guardando…" : "Guardar preferencia"}</button><button type="button" className="btn btn-secondary" disabled={Boolean(busy) || !model || !canActivate} onClick={() => void action("test")}>{busy === "test" ? "Comprobando modelo…" : "Probar conexión"}</button><button type="button" className="codex-text-action" disabled={Boolean(busy)} onClick={() => void action("disconnect")}><Unplug size={16} aria-hidden="true" />Desconectar cuenta</button></div>
      </div>}
      <details className="codex-host-help"><summary>Preparar el Host y entender la conexión</summary><p>El administrador debe instalar o actualizar Codex en el Host de LexOpen. La autorización queda en una carpeta personal protegida, separada de otras cuentas de Codex del equipo. Si el Host no encuentra Codex, revisa su instalación con el administrador.</p><a href="https://learn.chatgpt.com/docs/app-server" target="_blank" rel="noreferrer" className="codex-text-action">Documentación oficial de Codex<ExternalLink size={14} aria-hidden="true" /></a></details>
    </>}
    {notice && <p className="codex-message" role="status">{notice}</p>}
  </section>;
}
