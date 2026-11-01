/**
 * Poller largo de Telegram vía worker del Host (sin endpoint público).
 * TELEGRAM_POLLING=1 CRON_SECRET=… NEXT_PUBLIC_APP_URL=… node scripts/telegram-poller.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

function offsetPath() {
  const dir = process.env.LEXOPEN_DATA_DIR || path.join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "telegram-update-offset.json");
}

function loadOffset() {
  try {
    const raw = JSON.parse(readFileSync(offsetPath(), "utf8"));
    return Number(raw.offset) || 0;
  } catch {
    return 0;
  }
}

function saveOffset(offset) {
  writeFileSync(
    offsetPath(),
    JSON.stringify({ offset, at: new Date().toISOString() })
  );
}

async function main() {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000").replace(
    /\/$/,
    ""
  );
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[telegram-poller] falta CRON_SECRET");
    process.exit(1);
  }
  if (process.env.TELEGRAM_POLLING !== "1") {
    console.error("[telegram-poller] defina TELEGRAM_POLLING=1");
    process.exit(1);
  }

  console.log("[telegram-poller] iniciando");
  for (;;) {
    try {
      const offset = loadOffset();
      const res = await fetch(`${baseUrl}/api/notify/worker`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": secret,
        },
        body: JSON.stringify({ telegramOffset: offset }),
        signal: AbortSignal.timeout(90_000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn("[telegram-poller]", body.error || res.status);
      } else {
        if (body.telegram?.nextOffset != null) {
          saveOffset(body.telegram.nextOffset);
        }
        if (body.telegram?.count) {
          console.log(`[telegram-poller] updates: ${body.telegram.count}`);
        }
      }
    } catch (e) {
      console.warn("[telegram-poller]", e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

main();
