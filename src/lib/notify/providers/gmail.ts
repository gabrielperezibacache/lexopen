import { sendGmailMessage } from "@/lib/integrations/gmail";
import { getGoogleConfig } from "@/lib/integrations/google";
import type { ChannelProvider, DecryptedDestination, SendResult } from "./types";
import type { RenderedMessage } from "@/lib/notify/render";

export function createGmailProvider(): ChannelProvider {
  return {
    id: "gmail",
    limits: { globalPerSec: 2, perDestinationPerSec: 0.5 },
    async health() {
      try {
        const cfg = await getGoogleConfig();
        if (!cfg?.accessToken) {
          return { ok: false, detail: "Google/Gmail no conectado" };
        }
        return { ok: true, detail: "oauth" };
      } catch (e) {
        return {
          ok: false,
          detail: e instanceof Error ? e.message : String(e),
        };
      }
    },
    async send(msg: RenderedMessage, dest: DecryptedDestination): Promise<SendResult> {
      if (dest.kind !== "email") {
        return { ok: false, retryable: false, error: "destino no email" };
      }
      try {
        const res = await sendGmailMessage({
          to: dest.email,
          subject: msg.subject || msg.title,
          text: msg.text,
          html: msg.html,
        });
        const id =
          res && typeof res === "object" && "id" in res
            ? String((res as { id: unknown }).id)
            : undefined;
        return { ok: true, providerMessageId: id };
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        const retryable = /timeout|429|5\d\d|HTTP 5/i.test(err);
        return { ok: false, retryable, error: err.slice(0, 400) };
      }
    },
  };
}
