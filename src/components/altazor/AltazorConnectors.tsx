"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Building2, Check, CircleAlert, Copy, Linkedin, Link2, Mail, RefreshCw, SquareTerminal } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import { operationKey } from "@/lib/client-submission-key";
import type { PublicLinkedInAccount, PublicationReceipt, ShareDraft, SharePreview } from "@/lib/personal-connectors/types";
import styles from "./AltazorConnectors.module.css";

const base = "/api/personal-connectors/linkedin";
const attemptKey = "altazor:linkedin:pending-attempt";
const stateLabels: Record<PublicLinkedInAccount["state"], string> = { unconfigured: "Configuración pendiente", disconnected: "Sin conectar", connecting: "Autorización pendiente", connected: "Autorización comprobada", expired: "Autorización vencida", verification_required: "Requiere comprobación", reconnect_required: "Vuelva a conectar", error: "No se pudo comprobar" };
const existingConnections = [
  { provider: "codex", label: "ChatGPT / Codex personal", href: "/cuenta#codex", description: "Inicie sesión y compruebe su autorización en Mi cuenta.", icon: SquareTerminal },
  { provider: "mail", label: "Mi correo", href: "/correo", description: "Abra su bandeja y administre sus cuentas de correo.", icon: Mail },
  { provider: "google", label: "Conexiones del estudio", href: "/integraciones", description: "Revise Google y los servicios del estudio según sus permisos.", icon: Building2 },
] as const;
type Form = { id?: string; revision?: number; title: string; body: string; sourceUrl: string; visibility: "CONNECTIONS" | "PUBLIC" };
const emptyForm = (): Form => ({ title: "", body: "", sourceUrl: "", visibility: "CONNECTIONS" });

export function AltazorConnectors({ compact = false }: { compact?: boolean }) {
  const uid = useId();
  const [account, setAccount] = useState<PublicLinkedInAccount | null>(null);
  const [existingProviders, setExistingProviders] = useState<string[] | null>(null);
  const [drafts, setDrafts] = useState<ShareDraft[]>([]), [receipts, setReceipts] = useState<PublicationReceipt[]>([]);
  const [form, setForm] = useState<Form>(emptyForm), [preview, setPreview] = useState<SharePreview | null>(null), [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [attemptId, setAttemptId] = useState(""), [authUrl, setAuthUrl] = useState("");
  const [saveKey, setSaveKey] = useState(""), [publishKey, setPublishKey] = useState("");
  const [withheldDrafts, setWithheldDrafts] = useState(0);
  const refresh = useCallback(async () => {
    const responses = await Promise.all([fetch("/api/personal-connectors", { cache: "no-store" }), fetch(`${base}/drafts`, { cache: "no-store" })]);
    if (responses.some(response => !response.ok)) throw new Error("No se pudo cargar su conexión. Vuelva a comprobarla.");
    const [connection, saved] = await Promise.all(responses.map(response => response.json()));
    setAccount(connection.linkedin);
    setExistingProviders(Array.isArray(connection.existingConnections) ? connection.existingConnections.flatMap((entry: { provider?: unknown }) => typeof entry?.provider === "string" ? [entry.provider] : []) : []);
    setDrafts(saved.drafts); setReceipts(saved.receipts); setWithheldDrafts(saved.withheldDrafts || 0);
  }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try { setAttemptId(sessionStorage.getItem(attemptKey) || ""); } catch { /* Private storage may be disabled. */ }
      void refresh().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar la conexión."); }).finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [refresh]);
  async function action<T>(url: string, payload?: unknown, method = "POST"): Promise<T | null> {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiMutation<T>(url, { method, headers: payload ? { "Content-Type": "application/json" } : undefined, ...(payload ? { body: JSON.stringify(payload) } : {}) });
      if (!result.ok) {
        setError(result.error);
        void fetch(base, { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(data => { if (data?.account) setAccount(data.account); }).catch(() => {});
        return null;
      }
      return result.data;
    } finally { setBusy(false); }
  }
  async function connect(purpose: "identity" | "publish") {
    const result = await action<{ attemptId: string; authUrl: string }>(`${base}/oauth/start`, { purpose, mode: "web" });
    if (!result) return;
    setAttemptId(result.attemptId); setAuthUrl(result.authUrl);
    try { sessionStorage.setItem(attemptKey, result.attemptId); } catch { /* The in-memory attempt still works. */ }
    setNotice("Continúe en LinkedIn y vuelva aquí para comprobar la autorización.");
  }
  async function complete() {
    const result = await action<{ account: PublicLinkedInAccount }>(`${base}/oauth/complete`, { attemptId });
    if (!result) return;
    setAccount(result.account); setAttemptId(""); setAuthUrl("");
    try { sessionStorage.removeItem(attemptKey); } catch { /* No credentials are stored here. */ }
    setNotice("La autorización se vinculó a su cuenta de ALTAZOR AI.");
  }
  async function verifyAccount() {
    const result = await action<{ account: PublicLinkedInAccount }>(`${base}/verify`);
    if (result) { setAccount(result.account); setNotice("LinkedIn confirmó la autorización de esta cuenta."); }
  }
  async function disconnect() {
    const result = await action<{ account: PublicLinkedInAccount }>(base, undefined, "DELETE");
    if (result) {
      setAccount(result.account); setAttemptId(""); setAuthUrl(""); setPreview(null);
      try { sessionStorage.removeItem(attemptKey); } catch { /* No credentials are stored here. */ }
      setNotice("Autorización eliminada de ALTAZOR AI. Puede revocar también el acceso en los ajustes de LinkedIn.");
    }
  }
  function update<K extends keyof Form>(key: K, value: Form[K]) { setForm(previous => ({ ...previous, [key]: value })); setPreview(null); setReviewed(false); setSaveKey(""); setPublishKey(""); }
  async function save() {
    const requestId = saveKey || operationKey(); setSaveKey(requestId);
    const payload = { title: form.title, body: form.body, sourceUrl: form.sourceUrl || null, visibility: form.visibility };
    const result = await action<{ draft: ShareDraft }>(form.id ? `${base}/drafts/${form.id}` : `${base}/drafts`, form.id ? { ...payload, revision: form.revision } : { ...payload, requestId }, form.id ? "PATCH" : "POST");
    if (!result) return;
    setForm({ ...form, id: result.draft.id, revision: result.draft.revision }); setSaveKey(""); setPreview(null); setReviewed(false);
    setDrafts(previous => [result.draft, ...previous.filter(draft => draft.id !== result.draft.id)]); setNotice("Borrador privado guardado en ALTAZOR AI.");
  }
  async function review() {
    if (!form.id) return;
    const result = await action<{ preview: SharePreview }>(`${base}/drafts/${form.id}/preview`);
    if (result) { setPreview(result.preview); setReviewed(false); setPublishKey(""); }
  }
  async function publish() {
    if (!preview || !reviewed || !preview.canPublish) return;
    const requestId = publishKey || operationKey(); setPublishKey(requestId);
    const result = await action<{ receipt: PublicationReceipt }>(`${base}/drafts/${preview.draft.id}/publish`, { revision: preview.draft.revision, previewHash: preview.previewHash, requestId, confirmed: true });
    if (!result) return;
    setReceipts(previous => [result.receipt, ...previous.filter(receipt => receipt.id !== result.receipt.id)]); setPreview(null); setReviewed(false);
    setNotice(result.receipt.status === "published" ? "LinkedIn confirmó la publicación. Puede abrirla desde su recibo." : result.receipt.status === "failed" ? "LinkedIn rechazó la publicación. El borrador se conserva." : "El envío no está confirmado. Compruebe su LinkedIn; ALTAZOR AI no lo reenviará automáticamente.");
  }
  async function copy() {
    try { await navigator.clipboard.writeText([form.body.trim(), form.sourceUrl.trim()].filter(Boolean).join("\n\n")); setNotice("Texto copiado. Puede revisarlo y publicarlo en LinkedIn."); }
    catch { setError("No se pudo copiar. Seleccione el texto del borrador y cópielo manualmente."); }
  }
  function selectDraft(draft: ShareDraft) { setForm({ ...draft, sourceUrl: draft.sourceUrl || "", visibility: draft.visibility === "PUBLIC" ? "PUBLIC" : "CONNECTIONS" }); setPreview(null); setReviewed(false); setSaveKey(""); setPublishKey(""); }
  const saved = drafts.find(draft => draft.id === form.id);
  const dirty = !saved || saved.title !== form.title || saved.body !== form.body || (saved.sourceUrl || "") !== form.sourceUrl || saved.visibility !== form.visibility;
  const unresolved = receipts.some(receipt => receipt.draftId === form.id && ["sending", "unknown"].includes(receipt.status));
  return <section className={styles.root} aria-labelledby={`${uid}-heading`}>
    <header className={styles.heading}><div><h2 id={`${uid}-heading`}>Conexiones personales</h2><p>Sus herramientas y sus borradores académicos, bajo su control.</p></div><Link2 aria-hidden="true" size={22} /></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {withheldDrafts > 0 && <p className={styles.notice} role="status">Hay {withheldDrafts} borrador(es) cuyo origen cambió o ya no está disponible. Revise sus fuentes antes de preparar una nueva versión.</p>}
    <nav className={styles.existing} aria-label="Herramientas y conexiones existentes" data-testid="altazor-existing-connections" data-catalog-state={existingProviders ? "ready" : loading ? "loading" : "unavailable"}>
      {existingProviders ? existingConnections.filter(entry => existingProviders.includes(entry.provider)).map(entry => <Link key={entry.provider} href={entry.href} prefetch={false} className={styles.existingLink}><entry.icon size={20} aria-hidden="true" /><span><strong>{entry.label}</strong><span>{entry.description}</span></span><ArrowRight size={17} aria-hidden="true" /></Link>) : <p className={styles.detail}>{loading ? "Consultando sus herramientas disponibles…" : "No se pudo cargar el catálogo de conexiones. Vuelva a abrir esta sección."}</p>}
    </nav>
    <div className={styles.connection} aria-busy={loading}>
      <Linkedin size={25} aria-hidden="true" /><div className={styles.connectionText}><h3>LinkedIn</h3><p>{loading ? "Cargando estado de su autorización…" : account ? stateLabels[account.state] : "Estado no disponible"}{account?.identity ? ` · ${account.identity.name}` : ""}</p>{account?.reason && <p className={styles.detail}>{account.reason}</p>}</div>
      <div className={styles.actions}>
        {account?.canVerify && <button type="button" disabled={busy} onClick={verifyAccount}><RefreshCw size={15} aria-hidden="true" />Comprobar</button>}
        {account?.canStartOAuth && <button type="button" disabled={busy} onClick={() => connect("identity")}>{account.connected ? "Renovar conexión" : "Conectar LinkedIn"}</button>}
        {account?.connected && !account.canPublish && account.canRequestPublish && <button type="button" disabled={busy} onClick={() => connect("publish")}>Autorizar publicación</button>}
        {(account?.identity || attemptId) && <button type="button" disabled={busy} onClick={disconnect}>Desconectar</button>}
      </div>
    </div>
    {authUrl && <p className={styles.pending}><a href={authUrl} target="_blank" rel="noopener noreferrer">Continuar en LinkedIn <ArrowUpRight size={14} aria-hidden="true" /></a></p>}
    {attemptId && <button className={styles.complete} type="button" disabled={busy} onClick={complete}>Comprobar autorización</button>}
    <p className={styles.boundary}>La conversación, los contactos y el feed se abren en LinkedIn. Aquí prepara y revisa lo que decide compartir.</p>
    {!compact && <div className={styles.workspace}>
      <aside className={styles.saved}><div className={styles.savedHeading}><h3>Mis borradores</h3><button type="button" disabled={busy} onClick={() => { setForm(emptyForm()); setPreview(null); setReviewed(false); setSaveKey(""); }}>Nuevo</button></div>{drafts.length ? <ul>{drafts.map(draft => <li key={draft.id}><button type="button" disabled={busy} aria-pressed={form.id === draft.id} onClick={() => selectDraft(draft)}>{draft.title}<span>Versión {draft.revision}</span></button></li>)}</ul> : <p>Guarde una idea, una lectura o una invitación académica. Sólo usted verá este borrador.</p>}</aside>
      <div className={styles.editor}>
        <form onSubmit={event => { event.preventDefault(); void save(); }}>
          <label htmlFor={`${uid}-title`}>Título privado del borrador</label><input id={`${uid}-title`} disabled={busy} value={form.title} maxLength={200} required onChange={event => update("title", event.target.value)} />
          <label htmlFor={`${uid}-body`}>Texto para compartir</label><textarea id={`${uid}-body`} disabled={busy} value={form.body} maxLength={3000} required rows={7} onChange={event => update("body", event.target.value)} /><span className={styles.counter}>{form.body.length} / 3000 caracteres</span>
          <label htmlFor={`${uid}-source`}>Enlace a la fuente <span>(opcional)</span></label><input id={`${uid}-source`} disabled={busy} value={form.sourceUrl} type="url" maxLength={2000} placeholder="https://…" onChange={event => update("sourceUrl", event.target.value)} />
          <label htmlFor={`${uid}-audience`}>Audiencia de la publicación por API</label><select id={`${uid}-audience`} disabled={busy} value={form.visibility} onChange={event => update("visibility", event.target.value as Form["visibility"])}><option value="CONNECTIONS">Mis contactos de primer grado</option><option value="PUBLIC">Pública</option></select>
          <p className={styles.detail}>Si publica manualmente, confirme la audiencia también en LinkedIn.</p>
          <div className={styles.actions}><button className={styles.primary} type="submit" disabled={busy || !form.title.trim() || !form.body.trim() || !dirty}>Guardar borrador privado</button><button type="button" disabled={!form.body.trim()} onClick={copy}><Copy size={15} aria-hidden="true" />Copiar texto</button><a href="https://www.linkedin.com/feed/" target="_blank" rel="noopener noreferrer">Abrir LinkedIn <ArrowUpRight size={14} aria-hidden="true" /></a></div>
        </form>
        <div className={styles.publish}><button type="button" disabled={busy || dirty || unresolved || !account?.canPublish} onClick={review}>Revisar publicación por API</button>{!account?.canPublish && <p>Puede guardar, copiar y abrir su borrador en LinkedIn. La publicación desde aquí requiere una autorización comprobada.</p>}{dirty && form.id && <p>Guarde los cambios antes de revisar la publicación.</p>}{unresolved && <p>Compruebe el envío pendiente en LinkedIn. Este borrador no se reenviará automáticamente.</p>}</div>
        {preview && <div className={styles.preview}><h3>Antes de publicar</h3><p>Autor: <strong>{preview.author}</strong> · {preview.visibility === "PUBLIC" ? "Publicación pública" : "Contactos de primer grado"}</p><p className={styles.postText}>{preview.commentary}</p>{preview.reason && <p>{preview.reason}</p>}<label className={styles.confirm}><input type="checkbox" disabled={busy} checked={reviewed} onChange={event => setReviewed(event.target.checked)} />Revisé este texto y la audiencia.</label><button className={styles.primary} type="button" disabled={busy || !reviewed || !preview.canPublish} onClick={publish}>Publicar en LinkedIn</button></div>}
        {receipts.filter(receipt => receipt.draftId === form.id).map(receipt => <div className={styles.receipt} key={receipt.id}>{receipt.status === "published" ? <Check size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}<p>{receipt.status === "published" ? "Publicación confirmada por LinkedIn." : receipt.status === "failed" ? "LinkedIn rechazó este intento; el borrador se conserva." : "Envío sin confirmación. Compruebe LinkedIn antes de intentar otra publicación."}{receipt.externalUrl && <> <a href={receipt.externalUrl} target="_blank" rel="noopener noreferrer">Ver publicación</a></>}</p></div>)}
      </div>
    </div>}
  </section>;
}
