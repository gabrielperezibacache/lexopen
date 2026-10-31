/**
 * WhatsApp — solo interfaz en 1.1; implementación Cloud API / Twilio en 1.2.
 */

import type { ChannelProvider, DecryptedDestination, SendResult } from "./types";
import type { RenderedMessage } from "@/lib/notify/render";

export const WHATSAPP_NOT_IMPLEMENTED =
  "WhatsApp llega en LexOpen 1.2 (Meta Cloud API / Twilio). En 1.1 solo existe la interfaz ChannelProvider.";

export function createWhatsAppMetaStub(): ChannelProvider {
  return {
    id: "whatsapp_meta",
    limits: { globalPerSec: 5, perDestinationPerSec: 1 },
    async health() {
      return { ok: false, detail: WHATSAPP_NOT_IMPLEMENTED };
    },
    async send(_msg: RenderedMessage, _dest: DecryptedDestination): Promise<SendResult> {
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
    async send(_msg: RenderedMessage, _dest: DecryptedDestination): Promise<SendResult> {
      return { ok: false, retryable: false, error: WHATSAPP_NOT_IMPLEMENTED };
    },
  };
}
