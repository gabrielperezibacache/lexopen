"use client";
import { useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
export function WhatsAppLinkPanel({ active, onChanged }: { active: boolean; onChanged: () => Promise<void> }) {
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [link, setLink] = useState<{ deepLink: string; text: string; expiresAt: string }>();
  async function request(method: "POST" | "DELETE") {
    setBusy(true); setError("");
    const result = await apiMutation<{ deepLink: string; text: string; expiresAt: string }>("/api/notify/whatsapp/link", { method, headers: { "Content-Type": "application/json" }, ...(method === "POST" ? { body: JSON.stringify({ consent }) } : {}) });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setLink(method === "POST" ? result.data : undefined); await onChanged();
  }
  return <section className="panel space-y-3 rounded-3xl p-5" aria-labelledby="whatsapp-link-title">
    <h2 id="whatsapp-link-title" className="font-semibold">Mi WhatsApp</h2>
    <p className="text-sm">{active ? "Teléfono verificado. Puede revocar el canal aquí o enviar BAJA al número del negocio." : "Vincule su teléfono enviando un código al número del negocio. Después active WhatsApp para los eventos que desea recibir en la matriz de preferencias."}</p>
    {!active && <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />Acepto vincular mi WhatsApp para recibir las notificaciones que active.</label>}
    <div className="flex flex-wrap gap-2"><button className="btn btn-secondary" type="button" disabled={busy || !active && !consent} onClick={() => void request(active ? "DELETE" : "POST")}>{busy ? "Procesando…" : active ? "Revocar WhatsApp" : "Obtener código de vinculación"}</button>{link && !active && <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void onChanged()}>Comprobar vinculación</button>}</div>
    {link && !active && <div className="space-y-2 text-sm"><a className="underline underline-offset-4" href={link.deepLink} target="_blank" rel="noopener noreferrer">Abrir WhatsApp para enviar el código</a><p>Envíe el mensaje completo: <code className="break-all">{link.text}</code></p><p>Válido hasta {new Date(link.expiresAt).toLocaleTimeString("es-CL")}. El código es de un solo uso.</p></div>}
    {error && <p role="alert" className="text-sm">{error}</p>}
  </section>;
}
