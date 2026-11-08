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
type ProviderSetup = { provider: EasyConnectorProvider; label: string; configured: boolean; source: "environment" | "saved" | "distributed" | "none"; publicClient?: boolean; callbackUri: string | null; canEdit: boolean; reason: string | null; registrationUrl: string };
type Props = { provider: EasyConnectorProvider; workspaceId: string | null; causaId?: string | null; gatewayReady: boolean; hasActiveSession: boolean; busy?: boolean; onBusyChange: (busy: boolean) => void; onDisconnect: (name: string, requestId: string) => Promise<boolean> };
const api = "/api/altazor/connectors/oauth";
const adminGuide = "https://github.com/gabrielperezibacache/lexopen/blob/main/docs/ALTAZOR-CONEXIONES.md#inicio-de-sesión-sencillo";
const providerLabels = { google: "Google", github: "GitHub", dropbox: "Dropbox", microsoft: "Microsoft 365" };
const providerOrigins: Record<EasyConnectorProvider, string> = { google: "https://accounts.google.com", github: "https://github.com", dropbox: "https://www.dropbox.com", microsoft: "https://login.microsoftonline.com" };
const providerHelp: Record<EasyConnectorProvider, string> = {
  google: "Permite consultar nombres y datos básicos de tus archivos de Drive.",
  github: "Permite consultar tu perfil y tus repositorios públicos de GitHub.",
  dropbox: "Permite buscar y leer los archivos de Dropbox que autorices.",
  microsoft: "Permite buscar y leer tus archivos de OneDrive. No autoriza enviar correos ni modificar archivos.",
};
const registrationSteps: Record<EasyConnectorProvider, { instruction: string; field: string; guide?: string }> = {
  google: { instruction: "En su proyecto de Google Cloud, habilite la API de Drive y configure la pantalla de consentimiento. En Clientes, cree un cliente de tipo Aplicación web.", field: "URI de redireccionamiento autorizados", guide: "https://developers.google.com/identity/protocols/oauth2/web-server?hl=es" },
  github: { instruction: "En los ajustes de desarrollador de GitHub, abra OAuth Apps y elija New OAuth App. Use la dirección de LexOpen como Homepage URL.", field: "Authorization callback URL", guide: "https://docs.github.com/es/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app" },
  dropbox: { instruction: "En la consola de Dropbox, cree una aplicación y habilite los permisos de lectura indicados en la guía del administrador.", field: "Redirect URIs" },
  microsoft: { instruction: "En Microsoft Entra, registre una aplicación para cuentas personales y profesionales. Añada una plataforma de aplicaciones móviles y de escritorio con esta dirección localhost. Configure sólo User.Read y Files.Read; el acceso renovable se solicita al iniciar sesión. No cree un secreto de cliente.", field: "URI de redirección de aplicaciones móviles y de escritorio", guide: "https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow" },
};

function officialUrl(raw: string, provider: EasyConnectorProvider) {
  const url = new URL(raw);
  if (url.origin !== providerOrigins[provider] || url.username || url.password || url.hash || raw.length > 12000 || ["access_token", "refresh_token", "client_secret", "password"].some(key => url.searchParams.has(key))) throw new Error("No se pudo confirmar la página oficial de ingreso. Vuelva a comprobar la conexión.");
  return url.href;
}

function AdminConnectorSetup({ provider, busy, onBusyChange }: { provider: EasyConnectorProvider; busy: boolean; onBusyChange: (busy: boolean) => void }) {
  const uid = useId(), formRef = useRef<HTMLFormElement>(null);
  const [setup, setSetup] = useState<ProviderSetup | null>(null), [loading, setLoading] = useState(true), [working, setWorking] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false), [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState("");
  const [publicClient, setPublicClient] = useState(provider === "microsoft");
  const steps = registrationSteps[provider];
  const refresh = useCallback(async () => {
    const response = await fetch(`${api}/setup`, { cache: "no-store" }), data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo comprobar la preparación del servicio.");
    const item = Array.isArray(data.providers) ? data.providers.find((item: ProviderSetup) => item.provider === provider) : null;
    if (!item || typeof item.canEdit !== "boolean") throw new Error("No se pudo confirmar la preparación del servicio.");
    setSetup(item);
    setPublicClient(provider === "microsoft" || item.publicClient === true);
  }, [provider]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    queueMicrotask(() => {
      if (active) void refresh().catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [open, refresh]);
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
      const result = await apiMutation(`${api}/setup`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, clientId: form.get("clientId"), clientSecret: publicClient ? "" : form.get("clientSecret"), ...(publicClient ? { publicClient: true } : {}), confirmed: true }) });
      if (!result.ok) { setError(result.error); return; }
      setEditing(false);
      setNotice("Preparación guardada. Cada profesional autoriza su cuenta por separado.");
      await refresh();
    } catch { setError("No se pudo confirmar la preparación. Vuelva a comprobar el estado antes de repetirla."); }
    finally { formRef.current?.reset(); setWorking(false); onBusyChange(false); }
  }
  return <details className={styles.admin} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Configurar {providerLabels[provider]}</summary>
    <div className={styles.setup}>
      {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
      {loading ? <p role="status">Comprobando la preparación del servicio…</p> : setup && <>
        <p>{setup.configured ? setup.source === "distributed" ? "Esta conexión viene preparada con LexOpen. Cada persona sólo necesita iniciar sesión con su cuenta." : setup.source === "environment" ? "Este servicio está preparado en la configuración del equipo." : "La preparación del estudio está guardada en LexOpen." : "Prepare la aplicación del estudio una sola vez. Después, cada profesional podrá iniciar sesión con su propia cuenta."}</p>
        {provider === "google" && <p>Para uso continuo, la aplicación de Google debe estar en Producción. En modo Prueba, Google limita la autorización renovable de Drive a siete días. <a href="https://developers.google.com/identity/protocols/oauth2#expiration" target="_blank" rel="noopener noreferrer">Ver condiciones de Google</a>.</p>}
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
              {provider === "dropbox" && <label><input type="checkbox" checked={publicClient} onChange={event => setPublicClient(event.target.checked)} disabled={busy || working} />Aplicación pública de escritorio con PKCE, sin secreto de cliente.</label>}
              {!publicClient && <label htmlFor={`${uid}-secret`}>Secreto de cliente (Client secret)<input id={`${uid}-secret`} name="clientSecret" type="password" required maxLength={4000} autoComplete="new-password" disabled={busy || working} /></label>}
              {publicClient && <p>Esta modalidad utiliza el identificador público y PKCE. No introduzcas un secreto de cliente.</p>}
              {provider === "github" && <p>Usa el valor completo del Client secret de la OAuth App de GitHub. No uses el identificador del secreto, un token personal ni un código de inicio de sesión.</p>}
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

/** Administrative app registration belongs in Settings, outside account sign-in. */
export function EasyConnectorAdministration() {
  const [busy, setBusy] = useState(false);
  return <section className={styles.root} aria-label="Preparación de aplicaciones del estudio" data-testid="easy-connector-administration">
    <h4>Preparación del estudio</h4>
    <p>Configura cada servicio una sola vez. Después, cada persona podrá conectar su cuenta desde Aplicaciones.</p>
    {(Object.keys(providerLabels) as EasyConnectorProvider[]).map(provider => <AdminConnectorSetup key={provider}
      provider={provider} busy={busy} onBusyChange={setBusy} />)}
  </section>;
}

export function EasyConnectorOAuth({ provider, workspaceId, causaId, gatewayReady, hasActiveSession, busy = false, onBusyChange, onDisconnect }: Props) {
  const uid = useId(), requestKey = useRef(operationKey()), filesRequestKey = useRef(operationKey()), disconnectKey = useRef(operationKey()), loadVersion = useRef(0), mounted = useRef(false);
  const [data, setData] = useState<OAuthStatus | null>(null), [loading, setLoading] = useState(true), [working, setWorking] = useState(false), [error, setError] = useState("");
  const [removeConfirmed, setRemoveConfirmed] = useState(false), [notice, setNotice] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
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
  const deviceAttempt = (attempt?.device || attempt?.external) && ["pending", "exchanging"].includes(attempt.state) ? attempt : null;
  useEffect(() => {
    if (!deviceAttempt || !workspaceId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (document.visibilityState !== "visible") { if (!cancelled) void refresh(); return; }
      try {
        const result = await apiMutation(`${api}/device`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: deviceAttempt.id }) });
        if (!cancelled && !result.ok) setError(result.error);
      } catch { if (!cancelled) setError("No pudimos comprobar el ingreso. Vuelve a comprobar la conexión."); }
      finally { if (!cancelled) await refresh(); }
    }, Math.max(5, deviceAttempt.device?.interval || 5) * 1000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [deviceAttempt, provider, workspaceId, refresh]);
  async function connect(access: "basic" | "files" = "basic") {
    if (!workspaceId || !current?.available || !gatewayReady || requiresStop || busy || working) return;
    setWorking(true); onBusyChange(true); setError(""); setNotice("");
    try {
      const result = await apiMutation<{ attemptId: string; provider: EasyConnectorProvider; authUrl: string; flow?: "redirect" | "external" | "device"; expiresAt: string }>(`${api}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, provider, external: true, requestId: access === "files" ? filesRequestKey.current : requestKey.current, ...(access === "files" ? { access } : {}), confirmed: true }) });
      if (!result.ok) { setError(result.error); const code = (result.data as { code?: string } | undefined)?.code; if (["oauth_attempt_consumed", "request_conflict"].includes(code || "")) setNeedsNewAttempt(true); return; }
      if (result.data.provider !== provider || !result.data.attemptId) throw new Error("No se pudo confirmar el inicio de sesión. Vuelva a comprobar el estado.");
      const url = officialUrl(result.data.authUrl, provider);
      if (result.data.flow === "device" || result.data.flow === "external") {
        if (result.data.flow === "device" && (provider !== "github" || url !== "https://github.com/login/device")) throw new Error("No se pudo confirmar la página oficial de ingreso.");
        const currentUrl = new URL(location.href); currentUrl.searchParams.set("oauthAttempt", result.data.attemptId); currentUrl.searchParams.set("oauthProvider", provider);
        window.history.replaceState(null, "", currentUrl.pathname + currentUrl.search);
        if (result.data.flow === "external") { setExternalUrl(url); window.open(url, "_blank", "noopener,noreferrer"); }
        await refresh();
        return;
      }
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
  const canConnect = Boolean(current?.available && gatewayReady && !requiresStop);
  const configurationHref = "/configuracion#cuentas-conectadas";
  return <section className={styles.root} aria-labelledby={`${uid}-title`} data-testid="easy-connector-oauth">
    <h4 id={`${uid}-title`} className={connected ? styles.connected : undefined}>{connected && <CheckCircle2 size={20} aria-hidden="true" />}{connected ? `${label} conectado` : `Tu cuenta de ${label}`}</h4>
    <p>{provider === "google" && (current?.canReadFiles || !current?.connected) ? "Conecta Drive para que Altazor pueda buscar y leer tus archivos en los encargos que le pidas." : providerHelp[provider]}</p>
    {!connected && current?.available && current.state !== "unavailable" && <p className={styles.hint}>Inicia sesión una vez. LexOpen conservará la conexión.</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    {loading ? <p role="status">Comprobando conexión…</p> : !workspaceId ? <p>Abre tu <a href={computerHref}>escritorio de Altazor</a> para preparar este espacio y conectar tu cuenta.</p> : <>
      {connected && <p role="status">{current?.autoRefresh ? "Conexión guardada. El acceso se renueva automáticamente." : "Conexión guardada para este espacio."}</p>}
      {(provider !== "github" || !current?.persistent) && connected && !current?.autoRefresh && (provider !== "google" || current?.canReadFiles) && <div className={styles.actions}>
        <p>Autoriza una vez la renovación automática para mantener tu cuenta conectada.</p>
        <button type="button" className={styles.primary} disabled={busy || working || !canConnect} onClick={() => { requestKey.current = operationKey(); filesRequestKey.current = operationKey(); void connect(provider === "google" ? "files" : "basic"); }}>Mantener conexión<ArrowUpRight size={16} aria-hidden="true" /></button>
      </div>}
      {provider === "google" && connected && !current?.canReadFiles && <div className={styles.actions}>
        <p>Para trabajar con el contenido de tus documentos, autoriza su lectura en Google.</p>
        <button type="button" className={styles.primary} disabled={busy || working || !canConnect} onClick={() => { if (needsNewAttempt) { filesRequestKey.current = operationKey(); setNeedsNewAttempt(false); } void connect("files"); }}>Autorizar lectura de archivos<ArrowUpRight size={16} aria-hidden="true" /></button>
      </div>}
      {pending && <p role="status">Termina el ingreso en {label}. Si ya lo hiciste, pulsa Comprobar conexión.</p>}
      {deviceAttempt?.external && externalUrl && <p><a href={externalUrl} target="_blank" rel="noopener noreferrer">Continuar en {label}<ArrowUpRight size={16} aria-hidden="true" /></a></p>}
      {deviceAttempt?.external && deviceAttempt.state === "pending" && !externalUrl && <div className={styles.actions}><p>Si se cerró la página de ingreso, puedes abrir un intento nuevo. El anterior no se reenviará.</p><button type="button" disabled={busy || working || !canConnect} onClick={() => { requestKey.current = operationKey(); filesRequestKey.current = operationKey(); void connect(provider === "google" ? "files" : "basic"); }}>Reiniciar ingreso en {label}<ArrowUpRight size={16} aria-hidden="true" /></button></div>}
      {deviceAttempt?.device && <div className={styles.device} aria-label="Iniciar sesión en GitHub">
        <p>Abre GitHub e introduce este código para conectar tu cuenta.</p>
        <code>{deviceAttempt.device.userCode}</code>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(deviceAttempt.device!.userCode); setNotice("Código copiado. Pégalo en la página oficial de GitHub."); } catch { setNotice("Selecciona y copia el código que aparece arriba."); } }}><Copy size={16} aria-hidden="true" />Copiar código</button>
        <a href="https://github.com/login/device" target="_blank" rel="noopener noreferrer">Continuar en GitHub<ArrowUpRight size={16} aria-hidden="true" /></a>
        <p className={styles.hint}>Al autorizar, vuelve aquí. LexOpen guardará la conexión.</p>
      </div>}
      {!connected && attemptProblem && <p className={styles.error} role="alert">{attemptProblem}</p>}
      {!connected && !attemptProblem && current && ["failed", "expired", "reconnect_required"].includes(current.state) && <p className={styles.error} role="alert">{current.reason || `Vuelve a conectar ${label} para renovar el acceso.`}</p>}
      {!connected && current?.state === "unavailable" && <p role="status">La conexión sigue guardada. No pudimos comprobar el acceso en este momento; vuelve a comprobarlo sin iniciar sesión otra vez.</p>}
      {!connected && attempt?.state === "completed" && <p role="status">El ingreso terminó. Comprueba la conexión para confirmar el acceso.</p>}
      {!connected && current && !current.available && <p>Servicio en preparación. {data?.canAdmin ? <a href={configurationHref}>Preparación del estudio en Configuración</a> : "Podrás conectar tu cuenta cuando el servicio esté habilitado."}</p>}
      {!connected && current?.available && !gatewayReady && <p>No pudimos comprobar el acceso a esta aplicación. <a href={computerHref}>Revisa tu escritorio</a> y vuelve a comprobar la conexión.</p>}
      {requiresStop && <p>Detén tu escritorio antes de cambiar las cuentas que usa. <a href={computerHref}>Revisar mi escritorio</a></p>}
      {!connected && <div className={styles.actions}>
        {pending || !current || current.state === "unavailable" ? <button type="button" className={styles.primary} disabled={busy || working} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden="true" />Comprobar conexión</button>
          : <button type="button" className={styles.primary} disabled={busy || working || !canConnect} onClick={() => { if (needsNewAttempt) { requestKey.current = operationKey(); filesRequestKey.current = operationKey(); setNeedsNewAttempt(false); } void connect(provider === "google" ? "files" : "basic"); }}>{working ? "Abriendo ingreso…" : current.available ? `Conectar ${label}` : "Servicio en preparación"}<ArrowUpRight size={16} aria-hidden="true" /></button>}
      </div>}
      <details className={styles.management}>
        <summary>{connected ? "Gestionar conexión" : "Opciones de conexión"}</summary>
        {current?.lastVerifiedAt && <p>Última comprobación: {new Date(current.lastVerifiedAt).toLocaleString("es-CL")}.</p>}
        <button type="button" disabled={busy || working} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden="true" />Comprobar conexión</button>
        {current?.state === "unavailable" && <button type="button" disabled={busy || working || !canConnect} onClick={() => { requestKey.current = operationKey(); filesRequestKey.current = operationKey(); void connect(provider === "google" ? "files" : "basic"); }}>Volver a autorizar mi cuenta</button>}
        {provider === "google" && <p>Para vincular carpetas de Drive a tus causas, abre <a href="/sincronizacion">Archivos conectados</a>.</p>}
        {current?.hasStoredConnection && <div className={styles.disconnect}><label className={styles.disconnectLabel}><input type="checkbox" checked={removeConfirmed} disabled={busy || working || requiresStop || !current.canDisconnect} onChange={event => setRemoveConfirmed(event.target.checked)} />Quiero desconectar {label} de este espacio.</label><button type="button" disabled={busy || working || requiresStop || !current.canDisconnect || !removeConfirmed} onClick={() => void disconnect()}>Desconectar {label}</button></div>}
        {data?.canAdmin && <p><a href={configurationHref}>Preparación del estudio en Configuración</a></p>}
      </details>
    </>}
  </section>;
}
