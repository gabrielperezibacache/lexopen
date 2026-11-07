"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, Code2, CreditCard, FileBox, Globe, Home, Link2, MessageSquare, Music2, Paintbrush, RefreshCw, Search } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import { operationKey } from "@/lib/client-submission-key";
import { CONNECTOR_CATALOG } from "@/lib/altazor/connectors/catalog";
import { connectorFieldPresentation } from "@/lib/altazor/connectors/presentation";
import type { ConnectorCatalogEntry, ConnectorConnection, ConnectorInventory } from "@/lib/altazor/connectors/types";
import type { ComputerStatus } from "@/lib/altazor/computer/types";
import { EasyConnectorOAuth } from "./EasyConnectorOAuth";
import { EASY_OAUTH_CONNECTOR, EASY_OAUTH_PROVIDERS } from "@/lib/altazor/connectors/easy-oauth-providers";
import styles from "./AltazorConnectorCatalog.module.css";

const categories = [
  { id: "all", label: "Todas", Icon: Link2 }, { id: "messaging", label: "Mensajes", Icon: MessageSquare }, { id: "social", label: "Redes sociales", Icon: Globe }, { id: "personal", label: "Agenda y contactos", Icon: CalendarDays }, { id: "git", label: "Desarrollo", Icon: Code2 }, { id: "productivity", label: "Productividad", Icon: CheckCircle2 }, { id: "office", label: "Oficina y archivos", Icon: FileBox }, { id: "finance", label: "Finanzas", Icon: CreditCard }, { id: "home", label: "Hogar e información", Icon: Home }, { id: "music", label: "Música", Icon: Music2 }, { id: "drawing", label: "Diseño", Icon: Paintbrush }, { id: "generic", label: "Otros", Icon: Globe },
];
type Inventory = ConnectorInventory & { operations?: { id: string; kind: string; status: string; createdAt: string }[] };
type MutationReply = { inventory?: Inventory; operation?: { status: string }; oauth?: { url: string; redirect: string }; test?: { ok: boolean; tested: boolean } };
const api = "/api/altazor/connectors";
const withoutRuntime: ConnectorCatalogEntry[] = CONNECTOR_CATALOG.map(entry => ({ ...entry, fields: [], available: false, oauthReady: false }));
function AdvancedOptions({ enabled, children }: { enabled: boolean; children: ReactNode }) { return enabled ? <details className={styles.setup}><summary>Opciones avanzadas</summary>{children}</details> : <>{children}</>; }

export function AltazorConnectorCatalog({ causaId }: { causaId?: string | null }) {
  const uid = useId(), formRef = useRef<HTMLFormElement>(null), requestKey = useRef(operationKey());
  const loadVersion = useRef(0), loadRequest = useRef<AbortController | null>(null), mounted = useRef(false);
  const detailHeading = useRef<HTMLHeadingElement>(null), searchInput = useRef<HTMLInputElement>(null), previousSelection = useRef("");
  const [computer, setComputer] = useState<ComputerStatus | null>(null), [inventory, setInventory] = useState<Inventory | null>(null);
  const [category, setCategory] = useState("all"), [query, setQuery] = useState(""), [selected, setSelected] = useState("");
  const [connection, setConnection] = useState<ConnectorConnection | null>(null), [name, setName] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [authUrl, setAuthUrl] = useState("");
  const [removeConfirmed, setRemoveConfirmed] = useState(false);
  const [verified, setVerified] = useState(false), [checking, setChecking] = useState(false);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    loadRequest.current?.abort();
    const controller = new AbortController(); loadRequest.current = controller;
    const current = () => mounted.current && !controller.signal.aborted && version === loadVersion.current;
    setChecking(true); setVerified(false); setAuthUrl("");
    try {
    const statusResponse = await fetch(`/api/altazor/computer${causaId ? `?causaId=${encodeURIComponent(causaId)}` : ""}`, { cache: "no-store", signal: controller.signal });
    const status = await statusResponse.json();
    if (!current()) return;
    if (!statusResponse.ok) throw new Error(status.error || "No se pudo comprobar el espacio de sus conexiones.");
    setComputer(status.computer);
    if (!status.computer.configured || !status.computer.workspaceId) { setInventory(null); setConnection(null); return; }
    const response = await fetch(`${api}?workspaceId=${encodeURIComponent(status.computer.workspaceId)}`, { cache: "no-store", signal: controller.signal });
    const result = await response.json();
    if (!current()) return;
    if (!response.ok) throw new Error(result.error || "No se pudieron comprobar las conexiones.");
    setInventory(result.connectors);
    setConnection(previous => previous ? result.connectors.connections.find((item: ConnectorConnection) => item.name === previous.name && item.kind === previous.kind) ?? null : null);
    setVerified(true);
    } catch (cause) {
      if (!current()) return;
      setVerified(false); setAuthUrl("");
      throw cause;
    } finally {
      if (current()) setChecking(false);
      if (loadRequest.current === controller) loadRequest.current = null;
    }
  }, [causaId]);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const params = new URLSearchParams(location.search);
      const returningProvider = params.has("oauthAttempt") && EASY_OAUTH_PROVIDERS.find(value => value === params.get("oauthProvider"));
      const provider = returningProvider || EASY_OAUTH_PROVIDERS.find(value => value === params.get("connector"));
      if (provider) {
        const kind = EASY_OAUTH_CONNECTOR[provider];
        setSelected(kind);
        setName(kind);
      }
      if (!returningProvider && params.get("oauth") === "failed") setError("No se pudo confirmar el ingreso. Elija la aplicación y vuelva a conectar su cuenta.");
      void load().catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; mounted.current = false; loadRequest.current?.abort(); };
  }, [load]);
  useEffect(() => {
    if (previousSelection.current === selected) return;
    previousSelection.current = selected;
    const target = selected ? detailHeading.current : searchInput.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [selected]);
  const catalog = inventory?.catalog || withoutRuntime;
  const entry = catalog.find(item => item.id === selected);
  const easyProvider = EASY_OAUTH_PROVIDERS.find(provider => EASY_OAUTH_CONNECTOR[provider] === entry?.id);
  const workspaceId = computer?.configured ? computer.workspaceId : null;
  const gatewayReady = Boolean(verified && !checking && computer?.policyAllowed && inventory?.gateReady && entry?.available && entry.fields.some(field => field.name === "token" && field.secret));
  const activeSession = Boolean(computer?.sessions.some(session => session.requiresStop || ["creating", "starting", "ready", "unknown"].includes(session.state)));
  const filtered = catalog.filter(item => (category === "all" || item.category === category) && `${item.label} ${item.description}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es").trim()));
  const canConfigure = Boolean(verified && !checking && computer?.configured && inventory && computer.policyAllowed && !activeSession);
  function select(item: ConnectorCatalogEntry, existing: ConnectorConnection | null = null) {
    setSelected(item.id); setConnection(existing); setName(existing?.name || item.id); setAuthUrl(""); setNotice(""); setError(""); setRemoveConfirmed(false); requestKey.current = operationKey(); formRef.current?.reset();
  }
  async function mutate(path: string, body: Record<string, unknown>, method = "POST"): Promise<MutationReply | null> {
    if (!computer?.workspaceId || !verified || checking) return null;
    loadVersion.current++; loadRequest.current?.abort();
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiMutation<MutationReply>(`${api}${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, workspaceId: computer.workspaceId, confirmed: true }) });
      if (!result.ok) { setError(result.error); await load().catch(() => {}); return null; }
      if (result.data.inventory) {
        setInventory(result.data.inventory); setVerified(true);
        setConnection(previous => previous ? result.data.inventory!.connections.find(item => item.name === previous.name && item.kind === previous.kind) ?? null : null);
      }
      if (result.data.operation && result.data.operation.status !== "completed") setNotice("Operación sin confirmar. Compruebe el estado antes de continuar; no se repetirá automáticamente.");
      return result.data;
    } finally { setBusy(false); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!entry) return;
    const form = new FormData(event.currentTarget), settings: Record<string, string> = {};
    for (const field of entry.fields) { const value = String(form.get(`setting:${field.name}`) || ""); if (value) settings[field.name] = value; }
    const result = await mutate(`/${encodeURIComponent(name)}`, { requestId: requestKey.current, configuration: { kind: entry.id, settings, signIn: false } }, "PUT");
    // Remove all credential inputs from the form after every attempt, including uncertainty.
    formRef.current?.reset();
    if (result?.inventory && result.operation?.status === "completed") { setConnection(result.inventory.connections.find(item => item.name === name) || null); requestKey.current = operationKey(); setNotice("Conexión guardada. Comprueba el acceso y elígela al abrir tu escritorio."); }
  }
  async function test() { if (!connection) return; const result = await mutate(`/${encodeURIComponent(connection.name)}/test`, {}); if (result) { setNotice(result.test?.ok && result.test.tested ? "El servicio confirmó la prueba de acceso." : result.test?.tested ? "La prueba no confirmó el acceso. Revise las credenciales y permisos." : "Este servicio no ofrece prueba automática. Compruebe su configuración antes de usarlo."); await load().catch(() => {}); } }
  async function oauth() { if (!connection) return; const result = await mutate(`/${encodeURIComponent(connection.name)}/oauth`, { requestId: requestKey.current }); if (result?.oauth?.url) { setAuthUrl(result.oauth.url); requestKey.current = operationKey(); setNotice("Continúe en la página oficial y vuelva aquí para comprobar el acceso."); } }
  async function remove() { if (!connection || !removeConfirmed) return; const result = await mutate(`/${encodeURIComponent(connection.name)}`, { requestId: requestKey.current }, "DELETE"); if (result?.operation?.status === "completed") { setConnection(null); setRemoveConfirmed(false); requestKey.current = operationKey(); setNotice("Se retiró la conexión del gateway. Puede revocar también el permiso en la aplicación de origen."); } }
  async function disconnectEasy(connectionName: string, requestId: string) { const result = await mutate(`/${encodeURIComponent(connectionName)}`, { requestId }, "DELETE"); if (result?.operation?.status !== "completed") return false; setConnection(previous => previous?.name === connectionName ? null : previous); return true; }
  return <section className={styles.catalog} aria-labelledby={`${uid}-heading`} data-testid="altazor-connector-catalog">
    <header className={styles.heading}><div><h2 id={`${uid}-heading`}>Aplicaciones</h2><p>Conecta las cuentas que quieres usar con Altazor.</p></div><Link2 size={25} aria-hidden="true" /></header>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {loading ? <p role="status">Comprobando tus aplicaciones…</p> : !computer?.configured ? <p className={styles.setup}>Prepara tu <a href={`/inicio?altazor=computer${causaId ? `&causaId=${encodeURIComponent(causaId)}` : ""}`}>escritorio de Altazor <ArrowRight size={15} aria-hidden="true" /></a> para conectar tus cuentas.</p> : (!easyProvider || checking || !verified || !inventory?.gateReady) && <div className={styles.runtime}><span role="status">{checking ? "Comprobando conexiones…" : !verified ? "Vuelve a comprobar tus conexiones." : inventory?.gateReady ? "Aplicaciones disponibles" : "Actualiza el escritorio de Altazor para habilitar estas conexiones."}</span><button type="button" disabled={busy || checking} onClick={() => { setError(""); void load().catch(cause => setError(cause.message)); }}><RefreshCw size={16} aria-hidden="true" />Comprobar estado</button></div>}
    {!loading && !computer?.configured && <button type="button" disabled={busy || checking} onClick={() => { setError(""); void load().catch(cause => setError(cause.message)); }}><RefreshCw size={16} aria-hidden="true" />Comprobar estado</button>}
    {inventory?.operations?.map(operation => <div key={operation.id} className={styles.pending}><p>Hay un cambio de conexión sin confirmar. Revise el estado de la aplicación; reconocerlo aquí no repite ni confirma su resultado.</p><button type="button" disabled={busy || checking || !verified} onClick={async () => { const result = await mutate(`/operations/${encodeURIComponent(operation.id)}`, {}); if (result) { await load().catch(() => {}); setNotice("Revisión registrada. La operación anterior no se reenvió."); } }}>Revisé el estado; continuar sin repetir</button></div>)}
    {entry ? <div className={styles.detail}>
      <button type="button" disabled={busy} onClick={() => { setSelected(""); setConnection(null); setAuthUrl(""); }}><ArrowLeft size={16} aria-hidden="true" />Todas las aplicaciones</button>
      <div className={styles.detailHeading}><h3 ref={detailHeading} tabIndex={-1}>{entry.label}</h3>{!easyProvider && <p>{entry.description}</p>}</div>
      {easyProvider && !loading && <EasyConnectorOAuth key={`${workspaceId || "unavailable"}:${easyProvider}`} provider={easyProvider} workspaceId={workspaceId} causaId={causaId} gatewayReady={gatewayReady} hasActiveSession={activeSession} busy={busy || checking || !verified} onBusyChange={setBusy} onDisconnect={disconnectEasy} />}
      <AdvancedOptions enabled={Boolean(easyProvider)}>
      {entry.fields.some(field => field.name === "token") && ["github", "google-workspace"].includes(entry.id) && <div className={styles.setup}><h4>Probar con permisos de lectura</h4>{entry.id === "google-workspace" ? <><p>En OAuth Playground, elija acceso Online y autorice únicamente <code>https://www.googleapis.com/auth/drive.metadata.readonly</code>. Inicie sesión personalmente, intercambie el código y pegue sólo el access token en el campo reservado de abajo. No necesita completar los campos de una aplicación OAuth para esta modalidad.</p><a href="https://developers.google.com/oauthplayground/" target="_blank" rel="noopener noreferrer">Abrir OAuth Playground de Google <ArrowUpRight size={15} aria-hidden="true" /></a></> : <><p>Cree personalmente un token fine-grained con caducidad de un día, acceso sólo al repositorio que elija y permiso Contents de lectura. Péguelo en el campo reservado de abajo. No necesita completar los campos de una aplicación OAuth para esta modalidad.</p><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Crear token limitado en GitHub <ArrowUpRight size={15} aria-hidden="true" /></a></>}<p>Guarde la conexión y pulse Probar acceso. Un inicio de sesión en el navegador no configura por sí solo este conector. Introduzca las credenciales únicamente en el proveedor o en el formulario reservado; no las envíe al chat.</p></div>}
      {entry.id === "slack" && <div className={styles.setup}><h4>Elija cómo conectar Slack</h4><ul><li><strong>Webhook:</strong> pegue su dirección para el canal al que enviará mensajes.</li><li><strong>Bot:</strong> introduzca el token del bot y el canal de destino.</li><li><strong>Inicio de sesión:</strong> registre su propia aplicación Slack, introduzca su identificador y secreto, y elija un canal. Después de guardar podrá iniciar sesión.</li></ul><p>Complete sólo los campos de la modalidad elegida. Los campos individuales se marcan según lo declarado por el servicio.</p></div>}
      {entry.platform === "macos-host" && <p className={styles.setup}>Requiere un gateway instalado en macOS, la aplicación correspondiente y sus permisos del sistema.</p>}
      {entry.blockedReason && <p className={styles.setup}>{entry.blockedReason}</p>}
      {inventory?.connections.filter(item => item.kind === entry.id).length ? <div className={styles.accounts}><strong>Mis conexiones</strong>{inventory.connections.filter(item => item.kind === entry.id).map(item => <button type="button" key={item.name} disabled={busy || checking || !verified} aria-pressed={connection?.name === item.name} onClick={() => select(entry, item)}>{item.name} · {!verified || checking ? "Sin comprobar" : item.signedIn ? "Sesión autorizada" : item.needsSignIn ? "Falta iniciar sesión" : "Configurada"}</button>)}<button type="button" disabled={busy} onClick={() => { select(entry); setName(`${entry.id}-personal`); }}>Otra cuenta</button></div> : null}
      {entry.available && !entry.blockedReason ? <form ref={formRef} key={`${entry.id}:${connection?.name || "new"}`} className={styles.form} onSubmit={save} autoComplete="off">
        <label htmlFor={`${uid}-name`}>Nombre de esta conexión<input id={`${uid}-name`} value={name} required pattern="[a-z][a-z0-9-]{0,79}" maxLength={80} disabled={busy || Boolean(connection) || !canConfigure} onChange={event => { setName(event.target.value); requestKey.current = operationKey(); }} /><span>Use letras minúsculas, números y guiones, por ejemplo correo-estudio.</span></label>
        {entry.fields.map(field => { const copy = connectorFieldPresentation(entry.id, field); return <label key={field.name} htmlFor={`${uid}-field-${field.name}`}>{copy.label}<span>{field.required ? "Obligatorio al configurar" : "Opcional según la modalidad"}</span>{field.secret && connection?.secretFields.includes(field.name) ? <span>Valor guardado; deje vacío para conservarlo.</span> : null}<input id={`${uid}-field-${field.name}`} name={`setting:${field.name}`} type={field.secret ? "password" : "text"} autoComplete={field.secret ? "new-password" : "off"} spellCheck={false} required={!connection && field.required} maxLength={6000} disabled={busy || !canConfigure} onChange={() => { requestKey.current = operationKey(); }} />{copy.help && <span>{copy.help}</span>}</label>; })}
        {!canConfigure && <p>{!verified || checking ? "Comprueba las conexiones antes de cambiar su configuración." : "Cierre el escritorio activo para cambiar sus conexiones. Así, una tarea conserva exactamente las aplicaciones que usted autorizó."}</p>}
        <button className={styles.primary} type="submit" disabled={busy || !canConfigure}>Guardar conexión</button>
      </form> : !entry.blockedReason && <p>Los campos de configuración aparecerán cuando su gateway dedicado confirme esta integración.</p>}
      {connection && <div className={styles.connectionActions}><div className={styles.actions}><button type="button" disabled={busy || !canConfigure} onClick={test}>Probar acceso</button>{entry.oauth && <button type="button" disabled={busy || !canConfigure || !(entry.oauthReady || connection.ownAppConfigured)} onClick={oauth}>Iniciar sesión en {entry.label}</button>}</div>{entry.oauth && !(entry.oauthReady || connection.ownAppConfigured) && <p>Para iniciar sesión, registre una aplicación en este servicio y guarde su identificador de cliente y su secreto. Las cuentas personales no autorizan el acceso automáticamente.</p>}{authUrl && <a href={authUrl} target="_blank" rel="noopener noreferrer">Continuar en la página oficial <ArrowUpRight size={15} aria-hidden="true" /></a>}<label className={styles.check}><input type="checkbox" disabled={busy || !canConfigure} checked={removeConfirmed} onChange={event => { setRemoveConfirmed(event.target.checked); requestKey.current = operationKey(); }} />Deseo retirar esta conexión del escritorio.</label><button type="button" disabled={busy || !canConfigure || !removeConfirmed} onClick={remove}>Retirar conexión</button></div>}
      </AdvancedOptions>
    </div> : <>
      <div className={styles.search}><Search size={18} aria-hidden="true" /><label className="sr-only" htmlFor={`${uid}-search`}>Buscar aplicaciones</label><input ref={searchInput} id={`${uid}-search`} value={query} type="search" placeholder="Buscar correo, GitHub, calendario…" onChange={event => setQuery(event.target.value)} /></div>
      <nav className={styles.categories} aria-label="Categorías de aplicaciones">{categories.filter(item => item.id === "all" || catalog.some(entry => entry.category === item.id)).map(item => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>)}</nav>
      <p className={styles.count} role="status">{filtered.length} aplicaciones{category !== "all" ? ` · ${categories.find(item => item.id === category)?.label}` : ""}</p>
      <ul className={styles.list}>{filtered.map(item => { const Icon = categories.find(category => category.id === item.category)?.Icon || Globe, accounts = inventory?.connections.filter(connection => connection.kind === item.id) || []; return <li key={item.id}><button type="button" onClick={() => select(item, accounts[0] || null)}><Icon size={22} aria-hidden="true" /><span><strong>{item.label}</strong><small>{accounts.length ? `${accounts.length} conexión(es) configurada(s)` : item.platform === "macos-host" ? "Requiere macOS" : "Sin configurar"}</small></span><ArrowRight size={17} aria-hidden="true" /></button></li>; })}</ul>
      {!filtered.length && <p>No hay coincidencias. Pruebe otro nombre o seleccione Todas.</p>}
    </>}
  </section>;
}
