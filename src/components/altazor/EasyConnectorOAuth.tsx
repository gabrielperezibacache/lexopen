"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, CheckCircle2, Copy, RefreshCw } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import { operationKey } from "@/lib/client-submission-key";
import type { EasyOAuthProvider, EasyOAuthStatus } from "@/lib/altazor/connectors/easy-oauth";
import styles from "./EasyConnectorOAuth.module.css";

export type EasyConnectorProvider = EasyOAuthProvider;
type OAuthStatus = EasyOAuthStatus;
type ProviderStatus = OAuthStatus["providers"][number];
type ProviderSetup = { provider: EasyConnectorProvider; label: string; configured: boolean; source: "environment" | "saved" | "none"; callbackUri: string | null; canEdit: boolean; reason: string | null; registrationUrl: string };
type Props = { provider: EasyConnectorProvider; workspaceId: string | null; causaId?: string | null; gatewayReady: boolean; hasActiveSession: boolean; busy?: boolean; onBusyChange: (busy: boolean) => void; onDisconnect: (name: string, requestId: string) => Promise<boolean> };
const api = "/api/altazor/connectors/oauth";
const adminGuide = "https://github.com/gabrielperezibacache/lexopen/blob/main/docs/ALTAZOR-CONEXIONES.md#inicio-de-sesión-sencillo";
const providerLabels = { google: "Google", github: "GitHub", dropbox: "Dropbox" };
const providerOrigins: Record<EasyConnectorProvider, string> = { google: "https://accounts.google.com", github: "https://github.com", dropbox: "https://www.dropbox.com" };
const providerHelp: Record<EasyConnectorProvider, string> = {
  google: "Consulte nombres y datos básicos de sus archivos de Drive. El permiso se limita a esos datos.",
  github: "Consulte su perfil y sus repositorios públicos de GitHub. Esta conexión permite lectura.",
  dropbox: "Busque, liste y lea archivos de Dropbox con su autorización. El acceso es temporal y se renueva desde aquí cuando vence.",
};
const registrationSteps: Record<EasyConnectorProvider, { instruction: string; field: string; guide?: string }> = {
  google: { instruction: "En su proyecto de Google Cloud, habilite la API de Drive y configure la pantalla de consentimiento. En Clientes, cree un cliente de tipo Aplicación web.", field: "URI de redireccionamiento autorizados", guide: "https://developers.google.com/identity/protocols/oauth2/web-server?hl=es" },
  github: { instruction: "En los ajustes de desarrollador de GitHub, abra OAuth Apps y elija New OAuth App. Use la dirección de LexOpen como Homepage URL.", field: "Authorization callback URL", guide: "https://docs.github.com/es/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app" },
  dropbox: { instruction: "En la consola de Dropbox, cree una aplicación y habilite los permisos de lectura indicados en la guía del administrador.", field: "Redirect URIs" },
};

function officialUrl(raw: string, provider: EasyConnectorProvider) {
  const url = new URL(raw);
  if (url.origin !== providerOrigins[provider] || url.username || url.password || url.hash || raw.length > 12000 || ["access_token", "refresh_token", "client_secret", "password"].some(key => url.searchParams.has(key))) throw new Error("No se pudo confirmar la página oficial de ingreso. Vuelva a comprobar la conexión.");
  return url.href;
}

function AdminConnectorSetup({ provider, verifyPermission, busy, onBusyChange, onPrepared }: { provider: EasyConnectorProvider; verifyPermission: boolean; busy: boolean; onBusyChange: (busy: boolean) => void; onPrepared: () => Promise<void> }) {
  const uid = useId(), formRef = useRef<HTMLFormElement>(null);
  const [setup, setSetup] = useState<ProviderSetup | null>(null), [loading, setLoading] = useState(true), [working, setWorking] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false), [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState("");
  const steps = registrationSteps[provider];
  const refresh = useCallback(async () => {
    const response = await fetch(`${api}/setup`, { cache: "no-store" }), data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo comprobar la preparación del servicio.");
    const item = Array.isArray(data.providers) ? data.providers.find((item: ProviderSetup) => item.provider === provider) : null;
    if (!item || typeof item.canEdit !== "boolean") throw new Error("No se pudo confirmar la preparación del servicio.");
    setSetup(item);
  }, [provider]);
  useEffect(() => {
    if (!verifyPermission && !open) return;
    let active = true;
    queueMicrotask(() => {
      if (active) void refresh().catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [open, refresh, verifyPermission]);
  async function copyCallback() {
    if (!setup?.callbackUri) return;
    try { await navigator.clipboard.writeText(setup.callbackUri); setCopied("Dirección de retorno copiada."); }
    catch { setCopied("Seleccione y copie la dirección de retorno que se muestra arriba."); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!setup?.canEdit || working || busy) return;
    const form = new FormData(event.currentTarget);
    setWorking(true); onBusyChange(true); setError(""); setNotice("");
    try {
      const result = await apiMutation(`${api}/setup`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, clientId: form.get("clientId"), clientSecret: form.get("clientSecret"), confirmed: true }) });
      if (!result.ok) { setError(result.error); return; }
      setEditing(false);
      setNotice("Preparación guardada. Cada profesional autoriza su cuenta por separado.");
      await refresh(); await onPrepared();
    } catch { setError("No se pudo confirmar la preparación. Vuelva a comprobar el estado antes de repetirla."); }
    finally { formRef.current?.reset(); setWorking(false); onBusyChange(false); }
  }
  if (verifyPermission && !setup) return null;
  return <details className={styles.admin} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Preparación inicial del administrador</summary>
    <div className={styles.setup}>
      {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
      {loading ? <p role="status">Comprobando la preparación del servicio…</p> : setup && <>
        <p>{setup.configured ? setup.source === "environment" ? "Este servicio está preparado en la configuración del equipo." : "La preparación del estudio está guardada en LexOpen." : "Prepare la aplicación del estudio una sola vez. Después, cada profesional podrá iniciar sesión con su propia cuenta."}</p>
        {setup.canEdit && setup.configured && !editing && <button type="button" disabled={busy || working} onClick={() => setEditing(true)}>Actualizar preparación</button>}
        {setup.canEdit && setup.callbackUri && (!setup.configured || editing) ? <ol className={styles.setupSteps}>
          <li>
            <strong>Registre la aplicación del estudio</strong>
            <p>{steps.instruction}</p>
            <a href={setup.registrationUrl} target="_blank" rel="noopener noreferrer">Abrir registro oficial de {providerLabels[provider]} <ArrowUpRight size={15} aria-hidden="true" /></a>
          </li>
          <li>
            <strong>Indique dónde debe volver el navegador</strong>
            <p>Pegue esta dirección exacta en «{steps.field}».</p>
            <code className={styles.callback}>{setup.callbackUri}</code>
            <button type="button" disabled={busy || working} onClick={() => void copyCallback()}><Copy size={16} aria-hidden="true" />Copiar dirección de retorno</button>
            {copied && <p className={styles.notice} role="status">{copied}</p>}
          </li>
          <li>
            <strong>Guarde los datos de la aplicación en LexOpen</strong>
            <form ref={formRef} className={styles.setupForm} onSubmit={save} autoComplete="off">
              <label htmlFor={`${uid}-client`}>Identificador de cliente (Client ID)<input id={`${uid}-client`} name="clientId" required maxLength={1000} autoComplete="off" spellCheck={false} disabled={busy || working} /></label>
              <label htmlFor={`${uid}-secret`}>Secreto de cliente (Client secret)<input id={`${uid}-secret`} name="clientSecret" type="password" required maxLength={4000} autoComplete="new-password" disabled={busy || working} /></label>
              <p>Estos datos pertenecen a la aplicación del estudio. Se guardan cifrados y sus valores quedan ocultos.</p>
              <button type="submit" disabled={busy || working}>Guardar preparación</button>
            </form>
          </li>
        </ol> : !setup.configured && <p>{setup.reason || "Abra LexOpen en el equipo local del estudio para obtener la dirección de retorno."}</p>}
        <div className={styles.setupLinks}>
          {steps.guide && <a href={steps.guide} target="_blank" rel="noopener noreferrer">Instrucciones de {providerLabels[provider]} <ArrowUpRight size={15} aria-hidden="true" /></a>}
          <a href={adminGuide} target="_blank" rel="noopener noreferrer">Consultar la guía del administrador <ArrowUpRight size={15} aria-hidden="true" /></a>
        </div>
      </>}
      {!loading && error && <button type="button" disabled={busy || working} onClick={() => { setError(""); void refresh().catch(cause => setError(cause.message)); }}>Volver a comprobar la preparación</button>}
    </div>
  </details>;
}

export function EasyConnectorOAuth({ provider, workspaceId, causaId, gatewayReady, hasActiveSession, busy = false, onBusyChange, onDisconnect }: Props) {
  const uid = useId(), requestKey = useRef(operationKey()), disconnectKey = useRef(operationKey()), loadVersion = useRef(0), mounted = useRef(false);
  const [data, setData] = useState<OAuthStatus | null>(null), [loading, setLoading] = useState(true), [working, setWorking] = useState(false), [error, setError] = useState("");
  const [removeConfirmed, setRemoveConfirmed] = useState(false), [notice, setNotice] = useState("");
  const [needsNewAttempt, setNeedsNewAttempt] = useState(false);
  const label = providerLabels[provider], current = data?.providers.find(item => item.provider === provider), attempt = data?.attempt?.provider === provider ? data.attempt : undefined;
  const requiresStop = hasActiveSession || data?.requiresStop === true;
  const refresh = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    const version = ++loadVersion.current, query = new URLSearchParams({ workspaceId }), params = new URLSearchParams(location.search);
    if (params.get("oauthProvider") === provider && params.get("oauthAttempt")) query.set("attemptId", params.get("oauthAttempt")!);
    try {
      const response = await fetch(`${api}?${query}`, { cache: "no-store" }), result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo comprobar la conexión. Vuelva a intentarlo.");
      if (result.workspaceId !== workspaceId || result.causaId !== (causaId || null) || typeof result.requiresStop !== "boolean" || !Array.isArray(result.providers) || !result.providers.some((item: ProviderStatus) => item.provider === provider && typeof item.connected === "boolean" && typeof item.tested === "boolean" && typeof item.available === "boolean" && typeof item.hasStoredConnection === "boolean" && typeof item.canDisconnect === "boolean")) throw new Error("No se pudo confirmar el estado de esta conexión.");
      if (mounted.current && version === loadVersion.current) { setData({ ...result, canAdmin: result.canAdmin === true }); setError(""); }
    } catch (cause) {
      if (mounted.current && version === loadVersion.current) { setData(null); setError(cause instanceof Error ? cause.message : "No se pudo comprobar la conexión."); }
    } finally { if (mounted.current && version === loadVersion.current) setLoading(false); }
  }, [workspaceId, causaId, provider]);
  useEffect(() => {
    mounted.current = true;
    const cancelReads = () => { loadVersion.current++; };
    queueMicrotask(() => { if (mounted.current) void refresh(); });
    const returned = () => { if (new URLSearchParams(location.search).has("oauthAttempt") && document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", returned); document.addEventListener("visibilitychange", returned);
    return () => { mounted.current = false; cancelReads(); window.removeEventListener("focus", returned); document.removeEventListener("visibilitychange", returned); };
  }, [refresh]);
  async function connect() {
    if (!workspaceId || !current?.available || !gatewayReady || requiresStop || busy || working) return;
    setWorking(true); onBusyChange(true); setError(""); setNotice("");
    try {
      const result = await apiMutation<{ attemptId: string; provider: EasyConnectorProvider; authUrl: string; expiresAt: string }>(`${api}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, provider, requestId: requestKey.current, confirmed: true }) });
      if (!result.ok) { setError(result.error); const code = (result.data as { code?: string } | undefined)?.code; if (["oauth_attempt_consumed", "request_conflict"].includes(code || "")) setNeedsNewAttempt(true); return; }
      if (result.data.provider !== provider || !result.data.attemptId) throw new Error("No se pudo confirmar el inicio de sesión. Vuelva a comprobar el estado.");
      const url = officialUrl(result.data.authUrl, provider);
      setNotice(`Continúe el ingreso en ${label}. Al terminar volverá a este espacio.`);
      window.location.assign(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo abrir el ingreso. Vuelva a comprobar el estado antes de reintentar."); }
    finally { if (mounted.current) { setWorking(false); onBusyChange(false); } }
  }
  async function disconnect() {
    if (!current?.connectionName || !current.hasStoredConnection || !current.canDisconnect || !removeConfirmed || requiresStop || busy || working) return;
    setWorking(true); setError(""); setNotice("");
    try {
      if (await onDisconnect(current.connectionName, disconnectKey.current)) { setRemoveConfirmed(false); disconnectKey.current = operationKey(); setNotice(`Se desconectó ${label} de este espacio.`); await refresh(); }
    } catch { setError("No se pudo confirmar la desconexión. Compruebe el estado antes de repetirla."); }
    finally { if (mounted.current) setWorking(false); }
  }
  const connected = Boolean(current?.connected && current.tested && current.state === "connected"), pending = attempt && ["pending", "exchanging"].includes(attempt.state);
  const attemptProblem = attempt && ["failed", "cancelled", "expired"].includes(attempt.state) ? attempt.reason || (attempt.state === "cancelled" ? "El ingreso se canceló. Puede volver a conectar cuando lo desee." : "No se confirmó el ingreso. Puede iniciar una conexión nueva.") : null;
  const computerHref = `/inicio?altazor=computer${causaId ? `&causaId=${encodeURIComponent(causaId)}` : ""}`;
  return <section className={styles.root} aria-labelledby={`${uid}-title`} data-testid="easy-connector-oauth">
    <h4 id={`${uid}-title`}>Conecte su cuenta de {label}</h4>
    <p>{providerHelp[provider]}</p>
    <p>Inicie sesión en la página oficial de {label}. Al terminar volverá a LexOpen.</p>
    {provider === "google" && <p>Para sincronizar carpetas de Drive, abra <a href="/sincronizacion">Archivos conectados</a>.</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    {loading ? <p role="status">Comprobando su conexión…</p> : !workspaceId ? <p>Antes de conectar su cuenta, prepare la <a href={computerHref}>Computadora de ALTAZOR</a> de este espacio.</p> : <>
      {connected && <p className={styles.connected} role="status"><CheckCircle2 size={19} aria-hidden="true" /><span>Conexión confirmada con {label}.{current?.lastVerifiedAt && <> Última comprobación: {new Date(current.lastVerifiedAt).toLocaleString("es-CL")}.</>}</span></p>}
      {pending && <p role="status">Esperando que termine el ingreso en {label}. Si ya volvió de la página oficial, compruebe el estado.</p>}
      {attemptProblem && <p className={styles.error} role="alert">{attemptProblem}</p>}
      {!connected && !attemptProblem && current && ["failed", "expired", "reconnect_required"].includes(current.state) && <p className={styles.error} role="alert">{current.reason || "La autorización necesita renovarse. Vuelva a conectar su cuenta."}</p>}
      {!connected && attempt?.state === "completed" && <p role="status">Volvió de la página oficial, pero aún no se confirmó el acceso en este espacio. Vuelva a comprobar el estado.</p>}
      {!connected && current && !current.available && <p>{current.reason || "El administrador debe habilitar esta conexión en LexOpen una sola vez."}</p>}
      {!connected && current?.available && !gatewayReady && <p>El escritorio todavía no confirma esta aplicación. Revise su estado antes de conectar la cuenta.</p>}
      {requiresStop && <p>El escritorio anterior aún no tiene un cierre confirmado. Revíselo y pulse Detener escritorio antes de conectar o desconectar una cuenta. Los cambios se aplican al próximo escritorio. <a href={computerHref}>Revisar mi escritorio</a></p>}
      <div className={styles.actions}>
        {current?.available && gatewayReady && !connected && <button type="button" className={styles.primary} disabled={busy || working || requiresStop} onClick={() => { if (needsNewAttempt) { requestKey.current = operationKey(); setNeedsNewAttempt(false); } void connect(); }}>{working ? "Abriendo ingreso…" : needsNewAttempt ? `Iniciar otro ingreso en ${label}` : `Conectar ${label}`}<ArrowUpRight size={16} aria-hidden="true" /></button>}
        <button type="button" disabled={busy || working} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden="true" />Volver a comprobar</button>
      </div>
      {current?.hasStoredConnection && <div className={styles.disconnect}><label className={styles.disconnectLabel}><input type="checkbox" checked={removeConfirmed} disabled={busy || working || requiresStop || !current.canDisconnect} onChange={event => setRemoveConfirmed(event.target.checked)} />Deseo desconectar {label} de este espacio.</label><button type="button" disabled={busy || working || requiresStop || !current.canDisconnect || !removeConfirmed} onClick={() => void disconnect()}>Desconectar {label}</button></div>}
    </>}
    {(!workspaceId || data?.canAdmin) && <AdminConnectorSetup provider={provider} verifyPermission={!workspaceId} busy={busy || working} onBusyChange={onBusyChange} onPrepared={refresh} />}
  </section>;
}
