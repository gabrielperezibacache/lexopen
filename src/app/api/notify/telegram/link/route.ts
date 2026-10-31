import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireUser } from "@/lib/api";
import {
  createTelegramLinkCode,
  revokeCanal,
} from "@/lib/notify/channels";
import { getTelegramConfig } from "@/lib/notify/config";
import { prisma } from "@/lib/db";
import { rateLimitAsync } from "@/lib/auth/rate-limit";

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireUser();
    const rl = await rateLimitAsync(`tg-link:${user.id}`, 5, 15 * 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Demasiados intentos; espere unos minutos" },
        { status: 429 }
      );
    }

    const tg = await getTelegramConfig();
    if (!tg.enabled || !tg.config) {
      return NextResponse.json(
        { error: "Telegram no está habilitado en este Host" },
        { status: 400 }
      );
    }

    const { code, expiresAt } = await createTelegramLinkCode(user.id);
    const username = tg.config.botUsername?.replace(/^@/, "") || null;
    const deepLink = username
      ? `https://t.me/${username}?start=${encodeURIComponent(code)}`
      : null;

    return NextResponse.json({
      ok: true,
      code,
      expiresAt,
      deepLink,
      botUsername: username,
      instruction: deepLink
        ? "Abre el enlace o envía /start con el código al bot"
        : "Envía al bot: /start " + code,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireUser();
    await revokeCanal({ userId: user.id, canal: "telegram" });
    await prisma.canalUsuario.deleteMany({
      where: { userId: user.id, canal: "telegram", estado: "pendiente" },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
