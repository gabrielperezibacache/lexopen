import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireRole } from "@/lib/api";
import { verifyCronSecret } from "@/lib/security/cron-secret";
import { processOutboxBatch } from "@/lib/notify/worker";
import { pollTelegramOnce } from "@/lib/notify/telegram-handlers";
import { getTelegramConfig } from "@/lib/notify/config";

function authorizedByCron(req: NextRequest) {
  const header =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return verifyCronSecret(header);
}

/** Procesa outbox + un tick opcional de Telegram long-poll. */
export async function POST(req: NextRequest) {
  try {
    if (!authorizedByCron(req)) {
      assertCsrf(req);
      await requireRole("admin");
    }

    const outbox = await processOutboxBatch({ limit: 30 });

    let telegram: { count: number; nextOffset?: number } | null = null;
    if (process.env.TELEGRAM_POLLING === "1") {
      const tg = await getTelegramConfig();
      if (tg.enabled && tg.config) {
        const body = (await req.json().catch(() => ({}))) as {
          telegramOffset?: number;
        };
        const offsetRaw = Number(
          body.telegramOffset ?? process.env.TELEGRAM_UPDATE_OFFSET ?? 0
        );
        const result = await pollTelegramOnce({
          botToken: tg.config.botToken,
          offset: Number.isFinite(offsetRaw) ? offsetRaw : 0,
        });
        telegram = { count: result.count, nextOffset: result.nextOffset };
      }
    }

    return NextResponse.json({ ok: true, outbox, telegram });
  } catch (e) {
    return handleRouteError(e);
  }
}
