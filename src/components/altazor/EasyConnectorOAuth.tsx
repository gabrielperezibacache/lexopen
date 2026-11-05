"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, CheckCircle2, RefreshCw } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import { operationKey } from "@/lib/client-submission-key";
import type { EasyOAuthProvider, EasyOAuthStatus } from "@/lib/altazor/connectors/easy-oauth";
import styles from "./EasyConnectorOAuth.module.css";

export type EasyConnectorProvider = EasyOAuthProvider;
type OAuthStatus = EasyOAuthStatus;
type ProviderStatus = OAuthStatus["providers"][number];
type ProviderSetup = { provider: EasyConnectorProvider; label: string; configured: boolean; source: "environment" | "saved" | "none"; callbackUri: string | null; canEdit: boolean; reason: string | null; registrationUrl: string };
type Props = { provider: EasyConnectorProvider; workspaceId: string | null; causaId?: string | null; hasActiveSession: boolean; busy?: boolean; onBusyChange: (busy: boolean) => void; onDisconnect: (name: string, requestId: string) => Promise<boolean> };
const api = "/api/altazor/connectors/oauth";
const adminGuide = "https://github.com/gabrielperezibacache/lexopen/blob/main/docs/ALTAZOR-CONEXIONES.md#inicio-de-sesión-sencillo";
const providerLabels = { google: "Google", github: "GitHub" };

function officialUrl(raw: string, provider: EasyConnectorProvider) {
  const url = new URL(raw), host = provider === "google" ? "accounts.google.com" : "github.com";
  if (url.protocol !== "https:" || url.hostname !== host || url.username || url.password || url.hash || raw.length > 12000 || ["access_token", "refresh_token", "client_secret", "password"].some(key => url.searchParams.has(key))) throw new Error("No se pudo confirmar la página oficial de ingreso. Vuelva a comprobar la conexión.");
  return url.href;
}

function AdminConnectorSetup({ provider, busy, onBusyChange, onPrepared }: { provider: EasyConnectorProvider; busy: boolean; onBusyChange: (busy: boolean) => void; onPrepared: () => Promise<void> }) {
  const uid = useId(), formRef = useRef<HTMLFormElement>(null);
  const [setup, setSetup] = useState<ProviderSetup | null>(null), [loading, setLoading] = useState(true), [working, setWorking] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch(`${api}/setup`, { cache: "no-store" }), data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo comprobar la preparación del servicio.");
    const item = Array.isArray(data.providers) ? data.providers.find((item: ProviderSetup) => item.provider === provider) : null;
    if (!item || typeof item.canEdit !== "boolean") throw new Error("No se pudo confirmar la preparación del servicio.");
    setSetup(item);
  }, [provider]);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void refresh().catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); }); }); return () => { active = false; }; }, [refresh]);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!setup?.canEdit || working || busy) return;
    const form = new FormData(event.currentTarget);
    setWorking(true); onBusyChange(true); setError(""); setNotice("");
    try {
      const result = await apiMutation(`${api}/setup`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, clientId: form.get("clientId"), clientSecret: form.get("clientSecret"), confirmed: true }) });
      if (!result.ok) { setError(result.error); return; }
      setNotice("Preparación guardada. Cada profesional ya puede conectar su cuenta con el botón de ingreso.");
      await refresh(); await onPrepared();
    } catch { setError("No se pudo confirmar la preparación. Vuelva a comprobar el estado antes de repetirla."); }
    finally { formRef.current?.reset(); setWorking(false); onBusyChange(false); }
  }
  return <div className={styles.setup}>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {loading ? <p role="status">Comprobando la preparación del servicio…</p> : setup && <>
      <p>{setup.configured ? setup.source === "environment" ? "Este servicio ya está preparado por el administrador del equipo." : "La preparación de este servicio está guardada en LexOpen." : "Registre la aplicación del estudio una sola vez. Después, cada profesional iniciará sesión con su propia cuenta."}</p>
      {setup.reason && <p>{setup.reason}</p>}
      {setup.callbackUri && <p>Dirección de retorno para registrar la aplicación: <code>{setup.callbackUri}</code></p>}
      <div className={styles.setupLinks}><a href={setup.registrationUrl} target="_blank" rel="noopener noreferrer">Abrir registro oficial de {providerLabels[provider]} <ArrowUpRight size={15} aria-hidden="true" /></a><a href={adminGuide} target="_blank" rel="noopener noreferrer">Consultar la guía del administrador <ArrowUpRight size={15} aria-hidden="true" /></a></div>
      {setup.canEdit && <form ref={formRef} className={styles.setupForm} onSubmit={save} autoComplete="off"><label htmlFor={`${uid}-client`}>Identificador de la aplicación<input id={`${uid}-client`} name="clientId" required maxLength={1000} autoComplete="off" spellCheck={false} disabled={busy || working} /></label><label htmlFor={`${uid}-secret`}>Secreto de la aplicación<input id={`${uid}-secret`} name="clientSecret" type="password" required maxLength={4000} autoComplete="new-password" disabled={busy || working} /></label><p>Se guardan cifrados en este equipo. Los valores no vuelven a mostrarse.</p><button type="submit" disabled={busy || working}>Guardar preparación</button></form>}
    </>}
    {!loading && error && <button type="button" disabled={busy || working} onClick={() => { setError(""); void refresh().catch(cause => setError(cause.message)); }}>Volver a comprobar la preparación</button>}
  </div>;
}

export function EasyConnectorOAuth({ provider, workspaceId, causaId, hasActiveSession, busy = false, onBusyChange, onDisconnect }: Props) {
  const uid = useId(), requestKey = useRef(operationKey()), disconnectKey = useRef(operationKey()), loadVersion = useRef(0), mounted = useRef(false);
  const [data, setData] = useState<OAuthStatus | null>(null), [loading, setLoading] = useState(true), [working, setWorking] = useState(false), [error, setError] = useState("");
  const [removeConfirmed, setRemoveConfirmed] = useState(false), [notice, setNotice] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
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
    if (!workspaceId || !current?.available || requiresStop || busy || working) return;
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
    <p>{provider === "google" ? "Consulte la lista y los datos básicos de sus archivos de Drive. El contenido de los documentos queda fuera de este permiso." : "Consulte su perfil y sus repositorios públicos de GitHub. Esta conexión permite lectura."}</p>
    <p>Inicie sesión personalmente en la página oficial de {label}; al terminar volverá a este espacio.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    {loading ? <p role="status">Comprobando su conexión…</p> : !workspaceId ? <p>El administrador debe preparar este espacio de ALTAZOR antes de conectar sus aplicaciones.</p> : <>
      {connected && <p className={styles.connected} role="status"><CheckCircle2 size={19} aria-hidden="true" /><span>Conexión confirmada con {label}.{current?.lastVerifiedAt && <> Última comprobación: {new Date(current.lastVerifiedAt).toLocaleString("es-CL")}.</>}</span></p>}
      {pending && <p role="status">Esperando que termine el ingreso en {label}. Si ya volvió de la página oficial, compruebe el estado.</p>}
      {attemptProblem && <p className={styles.error} role="alert">{attemptProblem}</p>}
      {!connected && !attemptProblem && current && ["failed", "expired", "reconnect_required"].includes(current.state) && <p className={styles.error} role="alert">{current.reason || "La autorización necesita renovarse. Vuelva a conectar su cuenta."}</p>}
      {!connected && attempt?.state === "completed" && <p role="status">Volvió de la página oficial, pero aún no se confirmó el acceso en este espacio. Vuelva a comprobar el estado.</p>}
      {!connected && current && !current.available && <p>{current.reason || "El administrador debe habilitar esta conexión en LexOpen una sola vez."}</p>}
      {requiresStop && <p>El escritorio anterior aún no tiene un cierre confirmado. Revíselo y pulse Detener escritorio antes de conectar o desconectar una cuenta. Los cambios se aplican al próximo escritorio. <a href={computerHref}>Revisar mi escritorio</a></p>}
      <div className={styles.actions}>
        {current?.available && !connected && <button type="button" className={styles.primary} disabled={busy || working || requiresStop} onClick={() => { if (needsNewAttempt) { requestKey.current = operationKey(); setNeedsNewAttempt(false); } void connect(); }}>{working ? "Abriendo ingreso…" : needsNewAttempt ? `Iniciar otro ingreso en ${label}` : `Conectar ${label}`}<ArrowUpRight size={16} aria-hidden="true" /></button>}
        <button type="button" disabled={busy || working} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden="true" />Volver a comprobar</button>
      </div>
      {current?.hasStoredConnection && <div className={styles.disconnect}><label className={styles.disconnectLabel}><input type="checkbox" checked={removeConfirmed} disabled={busy || working || requiresStop || !current.canDisconnect} onChange={event => setRemoveConfirmed(event.target.checked)} />Deseo desconectar {label} de este espacio.</label><button type="button" disabled={busy || working || requiresStop || !current.canDisconnect || !removeConfirmed} onClick={() => void disconnect()}>Desconectar {label}</button></div>}
      {data?.canAdmin && <details className={styles.admin} onToggle={event => setSetupOpen(event.currentTarget.open)}><summary>Preparación inicial del administrador</summary>{setupOpen && <AdminConnectorSetup provider={provider} busy={busy || working} onBusyChange={onBusyChange} onPrepared={refresh} />}</details>}
    </>}
  </section>;
}
