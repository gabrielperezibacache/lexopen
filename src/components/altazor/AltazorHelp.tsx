"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { BellRing, RefreshCw } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import type { HelpRequestView } from "@/lib/altazor/help/service";
import { AltazorMessageContent } from "./AltazorMessageContent";
import { useAltazorCompanion } from "./AltazorCompanionProvider";
import "./AltazorTaskPanels.css";

const api = "/api/altazor/help";
type PersonalConfig = { ntfy: { enabled: boolean; baseUrl: string; topic: string; replyTopic: string; hasToken: boolean } | null; whatsapp: { enabled: boolean; channelId: string | null } };
type HelpState = { config: PersonalConfig; requests: HelpRequestView[]; whatsappChannels: { id: string; label: string }[]; whatsappAvailable: boolean; whatsappDisplayPhone: string | null; canConfigureProviders: boolean; canUse: boolean };
type MetaConfig = { enabled: boolean; phoneNumberId: string; apiVersion: string; templateName: string; templateLanguage: string; displayPhone: string; hasAccessToken: boolean; hasAppSecret: boolean; hasVerifyToken: boolean };
async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" }), data = await response.json();
  if (!response.ok) throw Object.assign(Error(data.error || "No se pudo consultar la ayuda de Altazor."), { status: response.status });
  return data;
}
async function change<T>(url: string, data: unknown, method = "POST"): Promise<T> {
  const result = await apiMutation<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  if (!result.ok) throw Error(result.error);
  return result.data;
}
const states: Record<string, string> = { pending: "Necesita tu ayuda", answered: "Respuesta recibida", resuming: "Retomando tarea", resumed: "Tarea retomada", resume_failed: "No se pudo retomar", cancelled: "Solicitud detenida", expired: "Solicitud vencida" };
const notificationStates: Record<string, string> = { pending: "Aviso pendiente", sending: "Enviando aviso", notified: "Aviso enviado", failed: "No se pudo enviar el aviso", uncertain: "Envío del aviso sin confirmar", unconfigured: "Sin canal de avisos", restricted: "Aviso bloqueado por permisos" };

export function AltazorHelp({ active = true }: { active?: boolean }) {
  const { reconcileHelp } = useAltazorCompanion();
  const [data, setData] = useState<HelpState | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ code: string; expiresAt: string; displayPhone: string | null; message: string } | null>(null);
  const token = useRef<HTMLInputElement>(null);
  const reload = useCallback(async (signal?: AbortSignal) => { const value = await read<HelpState>(api, signal); if (!signal?.aborted) setData(value); }, []);
  useEffect(() => {
    if (!active) return;
    const control = new AbortController();
    const refresh = () => { if (!control.signal.aborted) void reload(control.signal).catch(reason => { if (!control.signal.aborted) { if ([403, 404].includes(reason.status)) setData(null); setError(reason.message); } }); };
    queueMicrotask(refresh); const timer = window.setInterval(refresh, 15000);
    return () => { control.abort(); window.clearInterval(timer); };
  }, [active, reload]);
  async function perform(action: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await change<unknown>(api, action);
      await reload();
      return result;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo completar esta acción. Revisa su estado antes de repetirla."); return null; }
    finally { setBusy(false); }
  }
  async function configureNtfy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget), secret = String(fields.get("token") || "");
    const result = await perform({ action: "configure", config: { ntfy: { enabled: fields.get("enabled") === "on", baseUrl: String(fields.get("baseUrl") || "https://ntfy.sh"), topic: String(fields.get("topic") || ""), replyTopic: String(fields.get("replyTopic") || ""), ...(secret ? { token: secret } : {}) } } });
    if (token.current) token.current.value = "";
    if (result) setNotice("Tu configuración de ayuda por ntfy quedó guardada.");
  }
  async function configureWhatsapp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    const result = await perform({ action: "configure", config: { whatsapp: { enabled: fields.get("enabled") === "on", channelId: String(fields.get("channelId") || "") || null } } });
    if (result) setNotice("Tu canal de ayuda por WhatsApp quedó guardado.");
  }
  async function answer(event: FormEvent<HTMLFormElement>, request: HelpRequestView) {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
    const result = await perform({ action: "answer", requestId: request.id, response: String(fields.get("response") || "") });
    if (result) { form.reset(); setNotice(typeof result === "object" && "accepted" in result && result.accepted === false ? "La solicitud ya no admite esa respuesta. Revisa su estado actualizado." : "Respuesta registrada. Puedes consultar aquí el estado de la tarea."); }
  }
  async function checkReplies() {
    setBusy(true); setError(""); setNotice("");
    try { await reconcileHelp(); await reload(); setNotice("Respuestas comprobadas. El estado de las solicitudes está actualizado."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudieron comprobar las respuestas."); }
    finally { setBusy(false); }
  }
  return <section className="altazor-task-panel" data-testid="altazor-help" aria-label="Ayuda a distancia de Altazor">
    <header className="altazor-panel-heading"><div><h2><BellRing size={22} aria-hidden="true" />Cuando Altazor necesita tu ayuda</h2><p>Las decisiones pendientes quedan aquí. Puedes recibir avisos en ntfy o WhatsApp y responder sin perder el encargo.</p></div><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void checkReplies()}><RefreshCw size={16} />Comprobar respuestas</button></header>
    {error && <p className="altazor-error" role="alert">{error}</p>}{notice && <p className="altazor-notice" role="status">{notice}</p>}
    {!data && !error && <p role="status">Consultando solicitudes de ayuda…</p>}
    {data && <>
      {!data.canUse && <p className="altazor-panel-note">Tu usuario no tiene permiso para usar Altazor. Puedes revisar o desactivar tus canales de aviso.</p>}
      <section aria-label="Solicitudes de ayuda"><h3>Solicitudes</h3>{data.requests.length ? data.requests.map(request => <article className="altazor-help-request" key={request.id}><header className="altazor-panel-heading"><h3>{states[request.status] || "Estado por consultar"}</h3><span>{notificationStates[request.notificationStatus] || "Estado del aviso por consultar"}</span></header><AltazorMessageContent text={request.question} /><p className="altazor-panel-note">Vence el {new Date(request.expiresAt).toLocaleString("es-CL")}.</p>{request.response && <div><strong>Tu respuesta</strong><AltazorMessageContent text={request.response} plain /></div>}{request.status === "pending" && <form className="altazor-panel-form" onSubmit={event => void answer(event, request)}><fieldset disabled={busy || !data.canUse}><label>Respuesta para Altazor<textarea name="response" rows={3} required maxLength={2000} onChange={event => event.currentTarget.setCustomValidity(new TextEncoder().encode(event.currentTarget.value).byteLength > 2000 ? "La respuesta es demasiado extensa. Acórtala antes de enviarla." : "")} placeholder="Indica brevemente cómo quieres continuar." /></label><div className="altazor-panel-actions"><button className="btn btn-primary" type="submit">Enviar respuesta</button><button className="btn btn-ghost" type="button" onClick={() => void perform({ action: "cancel", requestId: request.id })}>Detener esta solicitud</button></div></fieldset></form>}{request.computerSessionId && <Link href={`/inicio?${new URLSearchParams({ altazor: "computer", escritorio: request.computerSessionId, ...(request.causaId ? { causaId: request.causaId } : {}) })}`}>Abrir escritorio</Link>}{request.conversationId && <Link href={`/inicio?${new URLSearchParams({ conversacion: request.conversationId })}`}>Abrir conversación</Link>}</article>) : <p className="altazor-panel-note">No tienes solicitudes de ayuda pendientes.</p>}</section>
      <details className="altazor-panel-disclosure"><summary>Mis canales de ayuda</summary><p className="altazor-panel-note">Los canales pertenecen a tu usuario. El aviso contiene un código para responder; la pregunta completa se consulta aquí, en LexOpen.</p><div className="altazor-help-settings-grid">
        <section><h3>ntfy</h3><form key={JSON.stringify(data.config.ntfy)} className="altazor-panel-form" onSubmit={configureNtfy}><fieldset disabled={busy}><label className="altazor-check"><input name="enabled" type="checkbox" defaultChecked={Boolean(data.config.ntfy?.enabled)} disabled={!data.canUse && !data.config.ntfy?.enabled} />Recibir solicitudes por ntfy</label><label>Servidor ntfy<input name="baseUrl" type="url" required defaultValue={data.config.ntfy?.baseUrl || "https://ntfy.sh"} /></label><label>Tema privado de avisos<input name="topic" maxLength={160} autoComplete="off" defaultValue={data.config.ntfy?.topic || ""} /></label><label>Tema privado de respuestas<input name="replyTopic" maxLength={160} autoComplete="off" defaultValue={data.config.ntfy?.replyTopic || ""} /></label><label>Token de ntfy<input ref={token} name="token" type="password" maxLength={3000} autoComplete="new-password" placeholder={data.config.ntfy?.hasToken ? "Token guardado · vacío para conservar" : "Token con acceso a ambos temas"} /></label><p className="altazor-panel-note">Suscríbete al tema de avisos en tu aplicación ntfy. Cada aviso explica cómo publicar la respuesta en el tema de respuestas con su código de solicitud.</p><button type="submit" className="btn btn-primary">Guardar ntfy</button></fieldset></form></section>
        <section><h3>WhatsApp</h3>{data.whatsappAvailable ? <><p className="altazor-panel-note">Vincula tu propio número enviando el código al WhatsApp del estudio{data.whatsappDisplayPhone ? `: ${data.whatsappDisplayPhone}` : "."}</p><button type="button" className="btn btn-secondary" disabled={busy || !data.canUse} onClick={() => { void perform({ action: "link_whatsapp" }).then(result => { if (result) setLink(result as typeof link); }); }}>Vincular mi WhatsApp</button>{link && <div role="status"><p>Envía este mensaje a {link.displayPhone || "la cuenta de WhatsApp del estudio"} antes del {new Date(link.expiresAt).toLocaleString("es-CL")}.</p><code className="altazor-help-code">{link.message}</code></div>}</> : <p className="altazor-panel-note">La administración del Host debe preparar la conexión de WhatsApp antes de vincular tu número.</p>}<form key={JSON.stringify(data.config.whatsapp) + data.whatsappChannels.length} className="altazor-panel-form" onSubmit={configureWhatsapp}><fieldset disabled={busy}><label className="altazor-check"><input name="enabled" type="checkbox" defaultChecked={data.config.whatsapp.enabled} disabled={!data.canUse && !data.config.whatsapp.enabled} />Recibir solicitudes por WhatsApp</label><label>Mi número verificado<select aria-label="Mi número verificado" name="channelId" defaultValue={data.config.whatsapp.channelId || ""}><option value="">Elige un número verificado</option>{data.whatsappChannels.map(channel => <option value={channel.id} key={channel.id}>{channel.label}</option>)}</select></label><button type="submit" className="btn btn-primary">Guardar WhatsApp</button></fieldset></form>{data.whatsappChannels.map(channel => <button type="button" className="btn btn-ghost" key={channel.id} disabled={busy} onClick={() => void perform({ action: "unlink_whatsapp", channelId: channel.id })}>Desvincular {channel.label}</button>)}</section>
      </div></details>
      {data.canConfigureProviders && <MetaHelpSettings />}
    </>}
  </section>;
}

function MetaHelpSettings() {
  const [config, setConfig] = useState<MetaConfig | null>(null), [open, setOpen] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) return; const control = new AbortController(); void read<MetaConfig>(`${api}/providers`, control.signal).then(value => { if (!control.signal.aborted) setConfig(value); }).catch(reason => { if (!control.signal.aborted) setError(reason.message); }); return () => control.abort(); }, [open]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form); setBusy(true); setError(""); setNotice("");
    const body: Record<string, unknown> = { enabled: fields.get("enabled") === "on" };
    for (const name of ["phoneNumberId", "apiVersion", "templateName", "templateLanguage", "displayPhone"]) body[name] = String(fields.get(name) || "");
    for (const name of ["accessToken", "appSecret", "verifyToken"]) { const value = String(fields.get(name) || ""); if (value) body[name] = value; }
    try { const result = await change<MetaConfig>(`${api}/providers`, body, "PUT"); setConfig(result); setNotice("La conexión de WhatsApp del Host quedó guardada."); for (const input of form.querySelectorAll<HTMLInputElement>('input[type="password"]')) input.value = ""; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la conexión."); }
    finally { setBusy(false); }
  }
  return <details className="altazor-panel-disclosure" onToggle={event => setOpen(event.currentTarget.open)}><summary>Administración del Host · WhatsApp</summary><p className="altazor-panel-note">Esta conexión es compartida por el estudio. Cada usuario debe verificar y activar después su propio número.</p>{error && <p role="alert" className="altazor-error">{error}</p>}{notice && <p role="status" className="altazor-notice">{notice}</p>}{open && !config && !error && <p role="status">Consultando la conexión del Host…</p>}{config && <form key={JSON.stringify(config)} className="altazor-panel-form" onSubmit={save}><fieldset disabled={busy}><label className="altazor-check"><input name="enabled" type="checkbox" defaultChecked={config.enabled} />Habilitar ayuda por WhatsApp para el estudio</label><label>Identificador del número de Meta<input name="phoneNumberId" required defaultValue={config.phoneNumberId} maxLength={40} /></label><label>Número de WhatsApp visible<input name="displayPhone" defaultValue={config.displayPhone} maxLength={40} /></label><label>Versión de la API de Meta<input name="apiVersion" required defaultValue={config.apiVersion} maxLength={10} /></label><label>Nombre de plantilla aprobada<input name="templateName" required defaultValue={config.templateName} maxLength={100} /></label><label>Idioma de la plantilla<input name="templateLanguage" required defaultValue={config.templateLanguage} maxLength={10} /></label><label>Token de acceso de Meta<input name="accessToken" type="password" autoComplete="new-password" maxLength={4000} placeholder={config.hasAccessToken ? "Guardado · vacío para conservar" : "Token de acceso"} /></label><label>Secreto de la aplicación de Meta<input name="appSecret" type="password" autoComplete="new-password" maxLength={1000} placeholder={config.hasAppSecret ? "Guardado · vacío para conservar" : "Secreto de la aplicación"} /></label><label>Token para verificar el webhook<input name="verifyToken" type="password" autoComplete="new-password" maxLength={1000} placeholder={config.hasVerifyToken ? "Guardado · vacío para conservar" : "Token de al menos 24 caracteres"} /></label><p className="altazor-panel-note">URL del webhook: <code>/api/altazor/help/whatsapp</code>. La plantilla aprobada debe admitir un parámetro de texto para la solicitud de ayuda.</p><button type="submit" className="btn btn-primary">Guardar conexión del Host</button></fieldset></form>}</details>;
}
