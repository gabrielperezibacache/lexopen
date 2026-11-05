"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { KeyRound, Plus, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import { operationKey } from "@/lib/client-submission-key";
import type { SecretMetadata } from "@/lib/altazor/secrets/types";
import styles from "./AltazorSecrets.module.css";

const base = "/api/altazor/secrets";
const kindLabel: Record<string, string> = { password: "Contraseña", api_token: "Token de aplicación", text: "Texto reservado" };

export function AltazorSecrets() {
  const uid = useId(), valueRef = useRef<HTMLInputElement>(null), requestKey = useRef(operationKey());
  const [items, setItems] = useState<SecretMetadata[]>([]), [selected, setSelected] = useState<SecretMetadata | null>(null);
  const [editing, setEditing] = useState(false), [deleting, setDeleting] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [name, setName] = useState(""), [provider, setProvider] = useState(""), [username, setUsername] = useState(""), [kind, setKind] = useState("password");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(base, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudieron cargar sus secretos. Vuelva a comprobarlos.");
    setItems(result.secrets);
  }, []);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load().catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); }); }); return () => { active = false; }; }, [load]);
  function begin(item: SecretMetadata | null) {
    setSelected(item); setName(item?.name || ""); setProvider(item?.provider || ""); setUsername(item?.username || ""); setKind(item?.kind || "password");
    setEditing(true); setDeleting(false); setConfirmed(false); setError(""); setNotice(""); requestKey.current = operationKey();
    if (valueRef.current) valueRef.current.value = "";
  }
  function changed() { requestKey.current = operationKey(); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiMutation<{ secret: SecretMetadata }>(selected ? `${base}/${encodeURIComponent(selected.id)}` : base, {
        method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestKey.current, ...(selected ? { revision: selected.revision } : {}), name, provider, username: username || null, kind, value: valueRef.current?.value || "" }),
      });
      if (!result.ok) { setError(result.error); return; }
      if (valueRef.current) valueRef.current.value = "";
      setItems(previous => [result.data.secret, ...previous.filter(item => item.id !== result.data.secret.id)]); setEditing(false); setSelected(null);
      setNotice(selected ? "Se sustituyó el secreto. Las autorizaciones anteriores de uso quedaron revocadas." : "Secreto cifrado guardado en su cuenta privada.");
    } finally { setBusy(false); }
  }
  async function remove() {
    if (!selected || !confirmed) return; setBusy(true); setError("");
    try {
      const result = await apiMutation(`${base}/${encodeURIComponent(selected.id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: requestKey.current, revision: selected.revision, confirmed: true }) });
      if (!result.ok) { setError(result.error); return; }
      setItems(previous => previous.filter(item => item.id !== selected.id)); setSelected(null); setEditing(false); setDeleting(false); setConfirmed(false);
      setNotice("Se eliminó el valor cifrado y se revocaron sus autorizaciones pendientes de uso.");
    } finally { setBusy(false); }
  }
  return <section className={styles.root} aria-labelledby={`${uid}-heading`} data-testid="altazor-secrets">
    <header className={styles.heading}><div><h2 id={`${uid}-heading`}>Secretos</h2><p>Sus credenciales, a mano cuando las necesita y fuera de la conversación.</p></div><KeyRound size={25} aria-hidden="true" /></header>
    <div className={styles.promise}><ShieldCheck size={23} aria-hidden="true" /><p>El valor se guarda cifrado y no vuelve a mostrarse. En Computadora, tome el control, elija el campo de destino y confirme cada uso. ALTAZOR lo escribirá sin añadirlo a su memoria.</p></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.toolbar}><h3>Mi archivo privado</h3><div><button type="button" disabled={busy || loading} onClick={() => { setError(""); void load().catch(cause => setError(cause.message)); }} aria-label="Actualizar lista de secretos"><RefreshCw size={17} aria-hidden="true" /></button><button type="button" className={styles.primary} disabled={busy} onClick={() => begin(null)}><Plus size={17} aria-hidden="true" />Agregar secreto</button></div></div>
    {loading ? <p role="status">Cargando sus credenciales…</p> : items.length ? <ul className={styles.list}>{items.map(item => <li key={item.id}><KeyRound size={18} aria-hidden="true" /><div><strong>{item.name}</strong><p>{item.provider}{item.username ? ` · ${item.username}` : ""}<span>{kindLabel[item.kind] || "Secreto"} · Versión {item.revision}</span></p></div><button type="button" disabled={busy} onClick={() => begin(item)} aria-label={`Administrar ${item.name}`}>Administrar</button></li>)}</ul> : <div className={styles.empty}><h3>Un lugar para sus accesos</h3><p>Guarde una contraseña o un token y asígnele un nombre reconocible. Los valores nunca aparecen en esta lista ni se envían al chat.</p></div>}
    {editing && <form className={styles.form} onSubmit={save} autoComplete="off" data-testid="altazor-secret-form">
      <div className={styles.toolbar}><h3>{selected ? `Administrar ${selected.name}` : "Nuevo secreto"}</h3><button type="button" disabled={busy} onClick={() => { if (valueRef.current) valueRef.current.value = ""; setEditing(false); setSelected(null); }} aria-label="Cerrar formulario"><X size={18} aria-hidden="true" /></button></div>
      <div className={styles.fields}><label htmlFor={`${uid}-name`}>Nombre<input id={`${uid}-name`} required maxLength={120} value={name} disabled={busy} onChange={event => { setName(event.target.value); changed(); }} placeholder="Acceso al portal del estudio" /></label><label htmlFor={`${uid}-provider`}>Aplicación o sitio<input id={`${uid}-provider`} required maxLength={120} value={provider} disabled={busy} onChange={event => { setProvider(event.target.value); changed(); }} placeholder="Nombre de la aplicación" /></label><label htmlFor={`${uid}-username`}>Usuario <span>(opcional, visible en la lista)</span><input id={`${uid}-username`} maxLength={200} value={username} disabled={busy} onChange={event => { setUsername(event.target.value); changed(); }} /></label><label htmlFor={`${uid}-kind`}>Tipo<select id={`${uid}-kind`} value={kind} disabled={busy} onChange={event => { setKind(event.target.value); changed(); }}>{Object.entries(kindLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <label htmlFor={`${uid}-value`}>{selected ? "Nuevo valor para sustituir el actual" : "Valor secreto"}<input ref={valueRef} id={`${uid}-value`} required type="password" autoComplete="new-password" spellCheck={false} maxLength={2000} disabled={busy} onChange={changed} /></label>
      <p>Escriba el valor sólo aquí. Para cambiar el nombre o la aplicación también debe introducir de nuevo el valor; nunca se recupera el anterior.</p>
      <div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy}>{busy ? "Guardando…" : selected ? "Sustituir secreto" : "Guardar secreto"}</button>{selected && <button type="button" disabled={busy} onClick={() => { setDeleting(true); setConfirmed(false); requestKey.current = operationKey(); }}><Trash2 size={16} aria-hidden="true" />Eliminar secreto</button>}</div>
      {deleting && selected && <div className={styles.deletion}><p>Se eliminará el valor de «{selected.name}» y sus permisos de uso pendientes. Si lo necesita de nuevo deberá agregarlo otra vez.</p><label className={styles.check}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} />Confirmo que deseo eliminar este secreto.</label><button type="button" disabled={busy || !confirmed} onClick={remove}>Eliminar definitivamente</button></div>}
    </form>}
  </section>;
}
