import { fetchSafeOutbound } from "@/lib/net/safe-url";
import type { TelegramConfig } from "@/lib/notify/config";
import { redactSecrets } from "@/lib/notify/secrets";
import type { ChannelProvider, DecryptedDestination, SendResult } from "./types";
import type { RenderedMessage } from "@/lib/notify/render";

const API = "https://api.telegram.org";

export function telegramApiUrl(botToken: string, method: string) {
  return `${API}/bot${botToken}/${method}`;
}

export function createTelegramProvider(config: TelegramConfig): ChannelProvider {
  return {
    id: "telegram",
    limits: { globalPerSec: 25, perDestinationPerSec: 1 },
    async health() {
      try {
        const res = await fetchSafeOutbound(telegramApiUrl(config.botToken, "getMe"), {
          method: "GET",
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          return {
            ok: false,
            detail: redactSecrets(`HTTP ${res.status}`, [config.botToken]),
          };
        }
        const body = (await res.json()) as { ok?: boolean; result?: { username?: string } };
        return {
          ok: Boolean(body.ok),
          detail: body.result?.username ? `@${body.result.username}` : "ok",
        };
      } catch (e) {
        return {
          ok: false,
          detail: redactSecrets(e instanceof Error ? e.message : String(e), [
            config.botToken,
          ]),
        };
      }
    },
    async send(
      msg: RenderedMessage,
      dest: DecryptedDestination,
      meta?: { notificationId?: string }
    ): Promise<SendResult> {
      if (dest.kind !== "telegram") {
        return { ok: false, retryable: false, error: "destino no telegram" };
      }
      const text = [msg.title, msg.text, msg.href ? msg.href : ""]
        .filter(Boolean)
        .join("\n");
      const reply_markup =
        msg.actions?.length && meta?.notificationId
          ? {
              inline_keyboard: [
                msg.actions.map((a) => ({
                  text: a.label,
                  callback_data: `${a.id}:${meta.notificationId}`.slice(0, 64),
                })),
              ],
            }
          : undefined;
      try {
        const res = await fetchSafeOutbound(
          telegramApiUrl(config.botToken, "sendMessage"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: dest.chatId,
              text: text.slice(0, 4000),
              disable_web_page_preview: true,
              reply_markup,
            }),
            signal: AbortSignal.timeout(20_000),
          }
        );
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          description?: string;
          result?: { message_id?: number };
          parameters?: { retry_after?: number };
        };
        if (res.status === 403 || /blocked|bot was blocked|user is deactivated/i.test(body.description || "")) {
          return {
            ok: false,
            retryable: false,
            blockDestination: true,
            error: redactSecrets(body.description || `HTTP ${res.status}`, [
              config.botToken,
            ]),
          };
        }
        if (!res.ok || !body.ok) {
          const retryAfter = body.parameters?.retry_after;
          const retryable =
            res.status === 429 || res.status >= 500 || Boolean(retryAfter);
          return {
            ok: false,
            retryable,
            retryAfterMs: retryAfter ? retryAfter * 1000 : undefined,
            error: redactSecrets(body.description || `HTTP ${res.status}`, [
              config.botToken,
            ]),
          };
        }
        return {
          ok: true,
          providerMessageId: body.result?.message_id
            ? String(body.result.message_id)
            : undefined,
        };
      } catch (e) {
        return {
          ok: false,
          retryable: true,
          error: redactSecrets(e instanceof Error ? e.message : String(e), [
            config.botToken,
          ]),
        };
      }
    },
  };
}

/** Long-poll getUpdates — sin endpoint público. */
export async function telegramGetUpdates(
  botToken: string,
  opts: { offset?: number; timeout?: number; limit?: number }
) {
  const res = await fetchSafeOutbound(telegramApiUrl(botToken, "getUpdates"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      offset: opts.offset,
      timeout: opts.timeout ?? 30,
      limit: opts.limit ?? 50,
      allowed_updates: ["message", "callback_query"],
    }),
    signal: AbortSignal.timeout(((opts.timeout ?? 30) + 10) * 1000),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    result?: unknown[];
    description?: string;
  };
  if (!res.ok || !body.ok) {
    throw new Error(
      redactSecrets(body.description || `getUpdates HTTP ${res.status}`, [botToken])
    );
  }
  return (body.result || []) as Array<Record<string, unknown>>;
}

export async function telegramAnswerCallback(
  botToken: string,
  callbackQueryId: string,
  text?: string
) {
  await fetchSafeOutbound(telegramApiUrl(botToken, "answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text || "Listo",
    }),
    signal: AbortSignal.timeout(10_000),
  });
}
