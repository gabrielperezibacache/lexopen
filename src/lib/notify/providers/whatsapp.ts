/** WhatsApp general notices and the separate Altazor help template contract. */

import type { ChannelProvider, SendResult } from "./types";
import type { WhatsAppConfig } from "../whatsapp-config";
import { e164 } from "../whatsapp-config";
import { createHmac, timingSafeEqual } from "node:crypto";
import { fetchSafeOutbound } from "@/lib/net/safe-url";
import { boundedProviderText } from "./ntfy";

export type WhatsAppMetaConfig = {
  phoneNumberId: string; accessToken: string; appSecret: string; verifyToken: string;
  apiVersion: string; templateName: string; templateLanguage: string; displayPhone?: string;
};
export type WhatsAppInbound = { id: string; from: string; text: string; timestamp: number; contextId?: string; phoneNumberId: string };

export function verifyWhatsAppSignature(body: string, signature: string | null, secret: string) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const supplied = Buffer.from(signature.slice(7), "hex");
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}

export function parseWhatsAppInbound(body: unknown): WhatsAppInbound[] {
  const result: WhatsAppInbound[] = [];
  if (!body || typeof body !== "object") return result;
  const root = body as { object?: string; entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; messages?: { id?: string; from?: string; type?: string; timestamp?: string; text?: { body?: string }; context?: { id?: string } }[] } }[] }[] };
  if (root.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return result;
  for (const entry of root.entry.slice(0, 20)) {
    if (!entry || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes.slice(0, 20)) {
      if (!change || !change.value || typeof change.value !== "object") continue;
      const value = change.value, phoneNumberId = value?.metadata?.phone_number_id;
      if (typeof phoneNumberId !== "string" || !/^\d{5,40}$/.test(phoneNumberId) || !Array.isArray(value.messages)) continue;
      for (const message of value.messages.slice(0, 50)) {
        if (!message) continue;
        if (message.type !== "text" || typeof message.id !== "string" || !message.id || message.id.length > 200 || typeof message.from !== "string" || !/^\d{7,15}$/.test(message.from) || typeof message.text?.body !== "string" || !message.text.body || message.text.body.length > 4500) continue;
        const timestamp = Number(message.timestamp);
        if (!Number.isFinite(timestamp)) continue;
        result.push({ id: message.id, from: message.from, text: message.text.body, timestamp, phoneNumberId, ...(typeof message.context?.id === "string" ? { contextId: message.context.id.slice(0, 200) } : {}) });
      }
    }
  }
  return result.slice(0, 100);
}

/** Altazor help: one approved text parameter carries the nonce for an authenticated reply.
 * The help service calls this explicitly with provider=whatsapp_meta; the general
 * outbox must use createWhatsAppProvider and its zero-variable template instead. */
export function createWhatsAppMetaProvider(config: WhatsAppMetaConfig, http: typeof fetchSafeOutbound = fetchSafeOutbound): ChannelProvider {
  const configured = /^\d{5,40}$/.test(config.phoneNumberId) && /^v\d{1,3}\.\d$/.test(config.apiVersion) && /^[a-z0-9_]{1,100}$/.test(config.templateName) && /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(config.templateLanguage) && Boolean(config.accessToken && config.appSecret && config.verifyToken);
  return {
    id: "whatsapp_meta", limits: { globalPerSec: 5, perDestinationPerSec: 1 },
    async health() { return { ok: configured, detail: configured ? "Configurado; la entrega y la plantilla se verifican al enviar." : "Configura Meta Cloud API y una plantilla aprobada con un parámetro de texto." }; },
    async send(message, destination): Promise<SendResult> {
      if (!configured || destination.kind !== "whatsapp" || !/^\+?[1-9]\d{6,14}$/.test(destination.e164)) return { ok: false, retryable: false, error: "WhatsApp Meta o el destino verificado no están configurados." };
      try {
        const response = await http(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
          method: "POST", headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: destination.e164.replace(/^\+/, ""), type: "template", template: { name: config.templateName, language: { code: config.templateLanguage }, components: [{ type: "body", parameters: [{ type: "text", text: message.text.slice(0, 1000) }] }] } }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) return { ok: false, retryable: response.status === 429 || response.status >= 500, uncertain: response.status >= 500, error: `WhatsApp Meta respondió HTTP ${response.status}.` };
        const value = JSON.parse(await boundedProviderText(response, 32 * 1024)) as { messages?: { id?: string }[] };
        const id = value.messages?.[0]?.id;
        if (typeof id !== "string" || !id || id.length > 512) return { ok: false, retryable: false, uncertain: true, error: "WhatsApp aceptó la solicitud sin un identificador verificable" };
        return { ok: true, providerMessageId: id };
      } catch { return { ok: false, retryable: false, uncertain: true, error: "No se pudo confirmar la entrega en WhatsApp. Comprueba la solicitud antes de reenviarla." }; }
    },
  };
}

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
        if (!res.ok) return { ok: false, retryable: res.status === 429, uncertain: res.status >= 500, error: `WhatsApp HTTP ${res.status}`, retryAfterMs: res.status === 429 ? 60_000 : undefined };
        const value = JSON.parse(await boundedProviderText(res, 32 * 1024)) as { messages?: { id?: string }[]; sid?: string } | null;
        const id = meta ? value?.messages?.[0]?.id : value?.sid;
        if (typeof id !== "string" || !id || id.length > 512) return { ok: false, retryable: false, uncertain: true, error: "WhatsApp aceptó la solicitud sin un identificador verificable" };
        return { ok: true, providerMessageId: id };
      } catch { return { ok: false, retryable: false, uncertain: true, error: "WhatsApp: respuesta de transporte desconocida; compruebe la entrega antes de reenviar" }; }
    },
  };
}
