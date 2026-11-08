"use client";
import { useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
export type WhatsAppSnapshot = { enabled: boolean; fields: Record<string, string>; hasCredentials: boolean };
const shared = [["businessNumber", "Número del negocio (E.164)", "tel"], ["callbackUrl", "URL pública HTTPS del webhook", "url"]] as const;
const meta = [["apiVersion", "Versión Graph habilitada en Meta (por ejemplo, v25.0)", "text"], ["phoneNumberId", "Identificador del número en Meta", "text"], ["templateName", "Nombre de plantilla aprobada sin variables", "text"], ["language", "Idioma de la plantilla (por ejemplo, es)", "text"], ["accessToken", "Token de acceso de Meta", "password"], ["appSecret", "App Secret de Meta para firmas", "password"], ["verifyToken", "Token de verificación del webhook (mínimo 24 caracteres)", "password"]] as const;
const twilio = [["accountSid", "Account SID de Twilio", "text"], ["contentSid", "Content SID de plantilla aprobada sin variables", "text"], ["authToken", "Auth Token de Twilio", "password"]] as const;
export function WhatsAppSettings({ snapshot, onSaved }: { snapshot: WhatsAppSnapshot; onSaved: () => Promise<void> }) {
  const [enabled, setEnabled] = useState(snapshot.enabled), [fields, setFields] = useState<Record<string, string>>({ vendor: "meta", ...snapshot.fields });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const whatsapp = Object.fromEntries(Object.entries(fields).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]));
    const result = await apiMutation("/api/integrations/notify", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "whatsapp", enabled, whatsapp }) });
    setBusy(false);
    if (!result.ok) { setMessage(result.error); return; }
    setFields(current => Object.fromEntries(Object.entries(current).filter(([key]) => !["accessToken", "authToken", "appSecret", "verifyToken"].includes(key))));
    setMessage("WhatsApp guardado. Vincule su teléfono en Cuenta → Notificaciones y elija los eventos que desea recibir."); await onSaved();
  }
  return <section className="panel space-y-3 rounded-3xl p-5" aria-labelledby="whatsapp-settings-title">
    <h3 id="whatsapp-settings-title" className="font-medium">WhatsApp</h3>
    <p className="text-sm text-[var(--ink-soft)]">Use una plantilla aprobada sin variables, por ejemplo: «Tiene nuevas notificaciones en LexOpen. Abra la aplicación para revisarlas». Las causas y los textos privados se consultan dentro de LexOpen.</p>
    <form onSubmit={save} className="space-y-4">
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={enabled} disabled={busy} onChange={event => setEnabled(event.target.checked)} />Habilitar WhatsApp en este Host</label>
      <label className="grid gap-1.5 text-sm">Proveedor<select className="select" value={fields.vendor} disabled={busy} onChange={event => setFields({ ...fields, vendor: event.target.value })}><option value="meta">Meta Cloud API</option><option value="twilio">Twilio</option></select></label>
      <div className="grid gap-4 sm:grid-cols-2">{[...shared, ...(fields.vendor === "meta" ? meta : twilio)].map(([key, label, type]) => <label key={key} className="grid min-w-0 gap-1.5 text-sm">{label}<input className="input" type={type} value={fields[key] || ""} disabled={busy} autoComplete={type === "password" ? "new-password" : "off"} onChange={event => setFields({ ...fields, [key]: event.target.value })} placeholder={type === "password" && snapshot.hasCredentials ? "Guardado: deje vacío para conservar" : undefined} /></label>)}</div>
      <p className="text-sm text-[var(--ink-soft)]">Configure la recepción de mensajes en {`/api/notify/whatsapp/webhook/${fields.vendor}`}. La URL debe coincidir exactamente con la registrada en el proveedor. Los secretos se cifran y no se devuelven al navegador.</p>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Guardando…" : "Guardar WhatsApp"}</button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>
  </section>;
}
