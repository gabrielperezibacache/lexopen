import { fetchSafeOutbound } from "@/lib/net/safe-url";
import type { WhatsAppConfig } from "../whatsapp-config";
import { e164 } from "../whatsapp-config";
import type { ChannelProvider, SendResult } from "./types";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
/** Approved, zero-variable template: no case names, links or document text in its body. */
export function createWhatsAppProvider(config: WhatsAppConfig, transport: Transport = fetchSafeOutbound): ChannelProvider {
  const meta = config.vendor === "meta";
  const base = meta ? `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}` : `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}`;
  const authorization = meta ? `Bearer ${config.accessToken}` : `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`;
  return {
    id: meta ? "whatsapp_meta" : "whatsapp_twilio",
    limits: { globalPerSec: 5, perDestinationPerSec: 1 },
    async health() {
      try {
        const res = await transport(meta ? `${base}?fields=id` : `${base}.json`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(10_000) });
        return { ok: res.ok, detail: res.ok ? "Credenciales aceptadas; compruebe la aprobación de la plantilla en el proveedor" : `WhatsApp HTTP ${res.status}` };
      } catch { return { ok: false, detail: "No se pudo comprobar WhatsApp" }; }
    },
    async send(_msg, dest): Promise<SendResult> {
      if (dest.kind !== "whatsapp" || !e164.test(dest.e164)) return { ok: false, retryable: false, error: "Destino WhatsApp inválido" };
      try {
        const body = meta ? JSON.stringify({ messaging_product: "whatsapp", to: dest.e164.slice(1), type: "template", template: { name: config.templateName, language: { code: config.language } } })
          : new URLSearchParams({ From: `whatsapp:${config.businessNumber}`, To: `whatsapp:${dest.e164}`, ContentSid: config.contentSid! }).toString();
        const res = await transport(meta ? `${base}/messages` : `${base}/Messages.json`, { method: "POST", headers: { Authorization: authorization, "Content-Type": meta ? "application/json" : "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(20_000) });
        // Provider response text can contain credentials and telephone numbers: never persist it.
        const value = await res.json().catch(() => null);
        if (!res.ok) return { ok: false, retryable: res.status === 429, uncertain: res.status >= 500, error: `WhatsApp HTTP ${res.status}`, retryAfterMs: res.status === 429 ? 60_000 : undefined };
        const id = meta ? value?.messages?.[0]?.id : value?.sid;
        if (typeof id !== "string" || !id || id.length > 512) return { ok: false, retryable: false, uncertain: true, error: "WhatsApp aceptó la solicitud sin un identificador verificable" };
        return { ok: true, providerMessageId: id };
      } catch { return { ok: false, retryable: false, uncertain: true, error: "WhatsApp: respuesta de transporte desconocida; compruebe la entrega antes de reenviar" }; }
    },
  };
}
