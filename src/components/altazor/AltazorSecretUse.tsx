"use client";

import { useEffect, useId, useState } from "react";
import { KeyRound } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import { operationKey } from "@/lib/client-submission-key";
import type { SecretMetadata, SecretUseGrant } from "@/lib/altazor/secrets/types";
import type { SecretTarget } from "@/lib/altazor/secrets/policy";
import styles from "./AltazorSecrets.module.css";

export function AltazorSecretUse({ sessionId, onBusyChange }: { sessionId: string; onBusyChange: (busy: boolean) => void }) {
  const uid = useId();
  const [items, setItems] = useState<SecretMetadata[]>([]), [selected, setSelected] = useState("");
  const [origin, setOrigin] = useState(""), [fieldLabel, setFieldLabel] = useState(""), [field, setField] = useState<SecretTarget["field"]>("password");
  const [confirmed, setConfirmed] = useState(false), [grant, setGrant] = useState<SecretUseGrant | null>(null), [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [key, setKey] = useState(operationKey);
  useEffect(() => { const controller = new AbortController(); void fetch("/api/altazor/secrets", { cache: "no-store", signal: controller.signal }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "Abra Secretos para comprobar sus credenciales."); setItems(result.secrets); }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); }); return () => controller.abort(); }, [sessionId]);
  const current = items.find(item => item.id === selected);
  async function act(action: "prepare" | "type" | "cancel") {
    if (!current && action === "prepare") return;
    setBusy(true); onBusyChange(true); setError("");
    try {
      const body = action === "prepare" ? { action, requestId: key, secretId: current!.id, revision: current!.revision, target: { sessionId, origin: origin.trim(), field, fieldLabel }, confirmed: true } : action === "type" ? { action, grantId: grant!.id, target: grant!.target, confirmed: true } : { action, grantId: grant!.id, confirmed: true };
      const result = await apiMutation<{ use: SecretUseGrant & { state: string } }>(`/api/altazor/computer/sessions/${encodeURIComponent(sessionId)}/secrets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!result.ok) { setError(result.error); return; }
      if (action === "prepare") { setGrant(result.data.use); setConfirmed(false); }
      else if (action === "cancel") { reset(); }
      else { setOutcome(result.data.use.state === "used" ? "El gateway confirmó la escritura. El control sigue siendo suyo; revise el formulario antes de continuar." : "La escritura no está confirmada. Compruebe el campo antes de autorizar otro uso. No se repetirá automáticamente."); }
    } finally { setBusy(false); onBusyChange(false); }
  }
  function reset() { setGrant(null); setConfirmed(false); setOutcome(""); setKey(operationKey()); }
  return <details className={styles.root} data-testid="altazor-secret-use"><summary><KeyRound size={17} aria-hidden="true" /> Escribir un secreto guardado</summary><div className={styles.form}>
    <h3>El destino lo elige usted</h3><p>En la captura, seleccione primero el campo de la página. Indique su origen y confirme el nombre del campo. ALTAZOR comprueba el escritorio, pero no verifica la dirección ni el campo de la página.</p>
    <p>Utilice un campo de contraseña oculto siempre que sea posible. Si la página muestra el valor, el asistente podría verlo cuando le devuelva el control. No se pulsa Enter ni se envía el formulario.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {outcome ? <><p className={styles.notice} role="status">{outcome}</p><button type="button" disabled={busy} onClick={reset}>Preparar otro uso</button></> : grant ? <>
      <p>Escribir <strong>{current?.name || "este secreto"}</strong> en <strong>{grant.target.origin}</strong>, campo «{grant.target.fieldLabel}». Esta autorización vence a las {new Date(grant.expiresAt).toLocaleTimeString("es-CL")}.</p>
      <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />Comprobé el sitio y seleccioné el campo indicado. Autorizo escribir este secreto una vez.</label>
      <div className={styles.actions}><button className={styles.primary} type="button" disabled={busy || !confirmed} onClick={() => act("type")}>Escribir una vez</button><button type="button" disabled={busy} onClick={() => act("cancel")}>Cancelar autorización</button></div>
    </> : items.length ? <>
      <label htmlFor={`${uid}-secret`}>Secreto guardado<select id={`${uid}-secret`} value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setConfirmed(false); setKey(operationKey()); }}><option value="">Seleccione una credencial</option>{items.map(item => <option key={item.id} value={item.id}>{item.name} · {item.provider}</option>)}</select></label>
      <label htmlFor={`${uid}-origin`}>Origen HTTPS que ve en la página<input id={`${uid}-origin`} value={origin} placeholder="https://portal.ejemplo.cl" type="url" disabled={busy} onChange={event => { setOrigin(event.target.value); setConfirmed(false); setKey(operationKey()); }} /></label>
      <div className={styles.fields}><label htmlFor={`${uid}-label`}>Nombre del campo seleccionado<input id={`${uid}-label`} value={fieldLabel} maxLength={120} placeholder="Contraseña" disabled={busy} onChange={event => { setFieldLabel(event.target.value); setConfirmed(false); setKey(operationKey()); }} /></label><label htmlFor={`${uid}-field`}>Tipo de campo<select id={`${uid}-field`} value={field} disabled={busy} onChange={event => { setField(event.target.value as SecretTarget["field"]); setConfirmed(false); setKey(operationKey()); }}><option value="password">Contraseña oculta</option><option value="token">Token</option><option value="text">Texto visible</option></select></label></div>
      <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />Tomé el control y seleccioné el campo de la página.</label><button type="button" disabled={busy || !confirmed || !selected || !origin || !fieldLabel.trim()} onClick={() => act("prepare")}>Revisar uso del secreto</button>
    </> : <p>Agregue una credencial en <a href="/inicio?altazor=connectors&conexion=secretos">Conexiones → Secretos</a> para usarla aquí.</p>}
  </div></details>;
}
