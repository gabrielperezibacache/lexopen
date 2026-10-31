import webpush from "web-push";
import type { WebPushConfig } from "@/lib/notify/config";
import { redactSecrets } from "@/lib/notify/secrets";
import type { ChannelProvider, DecryptedDestination, SendResult } from "./types";
import type { RenderedMessage } from "@/lib/notify/render";

export function createWebPushProvider(config: WebPushConfig): ChannelProvider {
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  return {
    id: "webpush",
    limits: { globalPerSec: 20, perDestinationPerSec: 2 },
    async health() {
      if (!config.publicKey || !config.privateKey) {
        return { ok: false, detail: "faltan claves VAPID" };
      }
      return { ok: true, detail: "vapid" };
    },
    async send(msg: RenderedMessage, dest: DecryptedDestination): Promise<SendResult> {
      if (dest.kind !== "push") {
        return { ok: false, retryable: false, error: "destino no push" };
      }
      try {
        const payload = JSON.stringify({
          title: msg.title,
          body: msg.text,
          url: msg.href || "/",
        });
        const result = await webpush.sendNotification(
          {
            endpoint: dest.subscription.endpoint,
            keys: dest.subscription.keys,
          },
          payload,
          { TTL: 60 * 60 }
        );
        return {
          ok: true,
          providerMessageId: result.statusCode
            ? String(result.statusCode)
            : undefined,
        };
      } catch (e) {
        const err = e as { statusCode?: number; message?: string; body?: string };
        const status = err.statusCode || 0;
        const message = redactSecrets(
          err.message || err.body || String(e),
          [config.privateKey]
        );
        if (status === 404 || status === 410) {
          return {
            ok: false,
            retryable: false,
            blockDestination: true,
            error: message,
          };
        }
        return {
          ok: false,
          retryable: status === 429 || status >= 500 || status === 0,
          error: message.slice(0, 400),
        };
      }
    },
  };
}

export function generateVapidKeys() {
  return webpush.generateVAPIDKeys();
}
