import webpush from "web-push";
import { fetchSafeOutbound, isSafeOutboundHttpUrl } from "@/lib/net/safe-url";
import type { WebPushConfig } from "@/lib/notify/config";
import { redactSecrets } from "@/lib/notify/secrets";
import type { ChannelProvider, DecryptedDestination, SendResult } from "./types";
import type { RenderedMessage } from "@/lib/notify/render";

/** Browser push services only; a subscription is not permission to contact an arbitrary host. */
export function isAllowedPushEndpoint(endpoint: string) {
  if (!isSafeOutboundHttpUrl(endpoint, { allowHttp: false })) return false;
  const url = new URL(endpoint);
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  return host === "fcm.googleapis.com" || host === "web.push.apple.com" ||
    host === "updates.push.services.mozilla.com" || host.endsWith(".push.services.mozilla.com") ||
    host.endsWith(".notify.windows.com");
}

export function isValidPushKeys(keys: { p256dh: string; auth: string }) {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]+={0,2}$/.test(keys.auth)) return false;
  const key = Buffer.from(keys.p256dh, "base64url"), auth = Buffer.from(keys.auth, "base64url");
  return key.length === 65 && key[0] === 4 && auth.length === 16;
}

export function createWebPushProvider(config: WebPushConfig): ChannelProvider {
  return {
    id: "webpush",
    limits: { globalPerSec: 20, perDestinationPerSec: 2 },
    async health() {
      return config.publicKey && config.privateKey
        ? { ok: true, detail: "vapid" } : { ok: false, detail: "faltan claves VAPID" };
    },
    async send(msg: RenderedMessage, dest: DecryptedDestination, meta): Promise<SendResult> {
      if (dest.kind !== "push" || (!isAllowedPushEndpoint(dest.subscription.endpoint) || !isValidPushKeys(dest.subscription.keys))) {
        return { ok: false, retryable: false, error: "destino push no permitido" };
      }
      try {
        const payload = JSON.stringify({ title: msg.title, body: msg.text,
          url: msg.href || "/", tag: meta?.dedupeKey || meta?.notificationId });
        // Generate the encrypted RFC payload locally; transport uses our redirect-blocking fetch.
        let details: ReturnType<typeof webpush.generateRequestDetails>;
        try {
          details = webpush.generateRequestDetails(dest.subscription, payload, {
            TTL: 3600, vapidDetails: { subject: config.subject,
              publicKey: config.publicKey, privateKey: config.privateKey },
          });
        } catch {
          return { ok: false, retryable: false, error: "No se pudo preparar el envío push. Revise la suscripción y las claves VAPID." };
        }
        const res = await fetchSafeOutbound(details.endpoint, {
          method: details.method, headers: details.headers,
          body: details.body ? Uint8Array.from(details.body).buffer : undefined,
          allowHttp: false, signal: AbortSignal.timeout(20_000),
        });
        if (res.ok) return { ok: true, providerMessageId: res.headers.get("location") || String(res.status) };
        const retryAfter = Number(res.headers.get("retry-after"));
        return { ok: false, retryable: res.status === 429 || res.status >= 500,
          blockDestination: res.status === 404 || res.status === 410,
          retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
          error: `Web Push HTTP ${res.status}` };
      } catch (error) {
        return { ok: false, retryable: true, uncertain: true,
          error: redactSecrets(error instanceof Error ? error.message : String(error),
            [config.privateKey, dest.subscription.endpoint, dest.subscription.keys.auth]).slice(0, 400) };
      }
    },
  };
}
export function generateVapidKeys() { return webpush.generateVAPIDKeys(); }
