/**
 * WhatsApp Meta Cloud API templates and signed inbound parsing.
 * Legacy factories remain for callers that explicitly request unavailable adapters.
 */

import type { ChannelProvider, SendResult } from "./types";
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

/** Meta templates can initiate a notification outside the 24-hour service window. */
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
        return { ok: true, providerMessageId: value.messages?.[0]?.id?.slice(0, 200) };
      } catch { return { ok: false, retryable: false, uncertain: true, error: "No se pudo confirmar la entrega en WhatsApp. Comprueba la solicitud antes de reenviarla." }; }
    },
  };
}

export const WHATSAPP_NOT_IMPLEMENTED =
  "Este adaptador legado no está disponible. Configure WhatsApp Meta Cloud API para los avisos de ayuda de Altazor.";

export function createWhatsAppMetaStub(): ChannelProvider {
  return {
    id: "whatsapp_meta",
    limits: { globalPerSec: 5, perDestinationPerSec: 1 },
    async health() {
      return { ok: false, detail: WHATSAPP_NOT_IMPLEMENTED };
    },
    async send(): Promise<SendResult> {
      return { ok: false, retryable: false, error: WHATSAPP_NOT_IMPLEMENTED };
    },
  };
}

export function createWhatsAppTwilioStub(): ChannelProvider {
  return {
    id: "whatsapp_twilio",
    limits: { globalPerSec: 5, perDestinationPerSec: 1 },
    async health() {
      return { ok: false, detail: WHATSAPP_NOT_IMPLEMENTED };
    },
    async send(): Promise<SendResult> {
      return { ok: false, retryable: false, error: WHATSAPP_NOT_IMPLEMENTED };
    },
  };
}
