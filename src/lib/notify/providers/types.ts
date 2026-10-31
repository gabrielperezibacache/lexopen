import type { RenderedMessage } from "@/lib/notify/render";

export type ProviderId =
  | "smtp"
  | "gmail"
  | "telegram"
  | "webpush"
  | "whatsapp_meta"
  | "whatsapp_twilio";

export type DecryptedDestination =
  | { kind: "email"; email: string }
  | { kind: "telegram"; chatId: string }
  | { kind: "push"; subscription: PushSubscriptionJSON }
  | { kind: "whatsapp"; e164: string };

export type SendOk = { ok: true; providerMessageId?: string };
export type SendFail = {
  ok: false;
  retryable: boolean;
  retryAfterMs?: number;
  error: string;
  /** Telegram 403 ⇒ bloquear canal. */
  blockDestination?: boolean;
};

export type SendResult = SendOk | SendFail;

export interface ChannelProvider {
  id: ProviderId;
  send(
    msg: RenderedMessage,
    dest: DecryptedDestination,
    meta?: { dedupeKey?: string; notificationId?: string }
  ): Promise<SendResult>;
  health(): Promise<{ ok: boolean; detail?: string }>;
  limits: { globalPerSec: number; perDestinationPerSec?: number };
}

export type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};
