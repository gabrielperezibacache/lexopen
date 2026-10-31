/**
 * Manejo de updates de Telegram (long-poll): /start <code>, callbacks de acuse,
 * comandos /hoy /plazos /silenciar.
 */

import { prisma } from "@/lib/db";
import { completeTelegramLink } from "@/lib/notify/channels";
import { ackNotification } from "@/lib/notify/plazos";
import {
  telegramAnswerCallback,
  telegramApiUrl,
} from "@/lib/notify/providers/telegram";
import { fetchSafeOutbound } from "@/lib/net/safe-url";
import { civilDateKey } from "@/lib/chile-time";
import { redactSecrets } from "@/lib/notify/secrets";

async function sendText(botToken: string, chatId: string, text: string) {
  await fetchSafeOutbound(telegramApiUrl(botToken, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4000),
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
}

function chatIdFromUpdate(update: Record<string, unknown>): string | null {
  const msg = update.message as { chat?: { id?: number } } | undefined;
  if (msg?.chat?.id != null) return String(msg.chat.id);
  const cb = update.callback_query as
    | { message?: { chat?: { id?: number } } }
    | undefined;
  if (cb?.message?.chat?.id != null) return String(cb.message.chat.id);
  return null;
}

async function userIdForChat(chatId: string): Promise<string | null> {
  const { hashDestino } = await import("@/lib/notify/secrets");
  const destinoHash = hashDestino("telegram", chatId);
  const row = await prisma.canalUsuario.findFirst({
    where: { canal: "telegram", destinoHash, estado: "activo" },
    select: { userId: true },
  });
  return row?.userId || null;
}

export async function handleTelegramUpdate(
  botToken: string,
  update: Record<string, unknown>
): Promise<{ handled: boolean; detail?: string }> {
  try {
    const cb = update.callback_query as
      | {
          id: string;
          data?: string;
          from?: { id?: number };
        }
      | undefined;
    if (cb?.data) {
      const [action, notificationId] = cb.data.split(":");
      if (action === "ack" && notificationId) {
        const chatId = chatIdFromUpdate(update);
        const userId = chatId ? await userIdForChat(chatId) : null;
        if (userId) {
          await ackNotification({
            notificationId,
            userId,
            via: "telegram",
          });
          await telegramAnswerCallback(botToken, cb.id, "Acuse registrado");
          return { handled: true, detail: "ack" };
        }
        await telegramAnswerCallback(botToken, cb.id, "Cuenta no vinculada");
        return { handled: true, detail: "ack_sin_vinculo" };
      }
    }

    const message = update.message as
      | { text?: string; chat?: { id?: number } }
      | undefined;
    if (!message?.text || message.chat?.id == null) {
      return { handled: false };
    }
    const chatId = String(message.chat.id);
    const text = message.text.trim();

    if (text.startsWith("/start")) {
      const code = text.split(/\s+/)[1];
      if (!code) {
        await sendText(
          botToken,
          chatId,
          "Para vincular LexOpen, genera un código en Cuenta → Notificaciones y envía /start <código>."
        );
        return { handled: true, detail: "start_sin_codigo" };
      }
      const result = await completeTelegramLink({ code, chatId });
      if (!result.ok) {
        await sendText(botToken, chatId, `No se pudo vincular: ${result.error}`);
        return { handled: true, detail: "link_fail" };
      }
      await sendText(
        botToken,
        chatId,
        "Telegram vinculado a LexOpen. Recibirás alertas de plazos fatales aquí. Comandos: /hoy /plazos /silenciar"
      );
      return { handled: true, detail: "linked" };
    }

    const userId = await userIdForChat(chatId);
    if (!userId) {
      await sendText(
        botToken,
        chatId,
        "Este chat no está vinculado. Usa /start <código> desde LexOpen."
      );
      return { handled: true, detail: "unlinked" };
    }

    if (text.startsWith("/silenciar")) {
      const hours = Number(text.split(/\s+/)[1] || "2");
      const h = Number.isFinite(hours) ? Math.min(24, Math.max(1, hours)) : 2;
      await prisma.perfilNotificacion.upsert({
        where: { userId },
        create: {
          userId,
          silenciadoHasta: new Date(Date.now() + h * 60 * 60_000),
        },
        update: {
          silenciadoHasta: new Date(Date.now() + h * 60 * 60_000),
        },
      });
      await sendText(botToken, chatId, `Silenciado ${h}h (críticos siguen).`);
      return { handled: true, detail: "silenciar" };
    }

    if (text.startsWith("/plazos") || text.startsWith("/hoy")) {
      const from = new Date();
      const until = new Date(Date.now() + 7 * 24 * 60 * 60_000);
      const plazos = await prisma.plazo.findMany({
        where: {
          estado: "pendiente",
          fechaLimite: { gte: from, lte: until },
          OR: [{ responsableId: userId }, { causa: { abogadoId: userId } }],
        },
        select: {
          titulo: true,
          fechaLimite: true,
          esFatal: true,
          causa: { select: { rit: true } },
        },
        orderBy: { fechaLimite: "asc" },
        take: 10,
      });
      if (!plazos.length) {
        await sendText(botToken, chatId, "Sin plazos en los próximos 7 días.");
        return { handled: true, detail: "plazos_empty" };
      }
      // Nivel mínimo: sin RIT en Telegram por defecto.
      const lines = plazos.map(
        (p) =>
          `• ${p.esFatal ? "FATAL" : "plazo"} vence ${civilDateKey(p.fechaLimite)} — abre LexOpen`
      );
      await sendText(botToken, chatId, ["Próximos plazos:", ...lines].join("\n"));
      return { handled: true, detail: "plazos" };
    }

    await sendText(
      botToken,
      chatId,
      "Comandos: /hoy /plazos /silenciar [horas]. Para acuses usa el botón del mensaje."
    );
    return { handled: true, detail: "help" };
  } catch (e) {
    return {
      handled: true,
      detail: redactSecrets(e instanceof Error ? e.message : String(e), [botToken]),
    };
  }
}

export async function pollTelegramOnce(opts: {
  botToken: string;
  offset?: number;
}) {
  const { telegramGetUpdates } = await import("@/lib/notify/providers/telegram");
  const updates = await telegramGetUpdates(opts.botToken, {
    offset: opts.offset,
    timeout: 25,
  });
  let nextOffset = opts.offset || 0;
  const results = [];
  for (const u of updates) {
    const updateId = Number((u as { update_id?: number }).update_id || 0);
    if (updateId >= nextOffset) nextOffset = updateId + 1;
    results.push(await handleTelegramUpdate(opts.botToken, u));
  }
  return { nextOffset, count: updates.length, results };
}
