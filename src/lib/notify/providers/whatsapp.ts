/**
 * WhatsApp — solo interfaz en 1.1; implementación Cloud API / Twilio en 1.2.
 */

import type { ChannelProvider, SendResult } from "./types";

export const WHATSAPP_NOT_IMPLEMENTED =
  "WhatsApp llega en LexOpen 1.2 (Meta Cloud API / Twilio). En 1.1 solo existe la interfaz ChannelProvider.";

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
