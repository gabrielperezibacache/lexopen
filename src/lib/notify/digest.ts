/**
 * Digest diario/semanal: agrupa MensajeSaliente en estado digest y envía uno.
 */

import { prisma } from "@/lib/db";
import { tipoDef } from "@/lib/notify/catalog";
import { isExternalChannel } from "@/lib/notify/catalog";
import { getProvider } from "@/lib/notify/providers/registry";
import { decryptCanalDestino } from "@/lib/notify/channels";
import { renderDigest } from "@/lib/notify/render";
import type { DecryptedDestination } from "@/lib/notify/providers/types";
import { wallParts, DEFAULT_TZ } from "@/lib/notify/time";

export async function processDigests(opts?: { now?: Date; mode?: "diario" | "semanal" }) {
  const now = opts?.now || new Date();
  const mode = opts?.mode || "diario";
  const parts = wallParts(now, DEFAULT_TZ);
  if (mode === "semanal" && parts.weekday !== 1) {
    return { sent: 0, skipped: "no_lunes" as const };
  }

  const pending = await prisma.mensajeSaliente.findMany({
    where: {
      estado: "digest",
      proximoIntentoAt: { lte: now },
    },
    orderBy: [{ userId: "asc" }, { canal: "asc" }, { createdAt: "asc" }],
    take: 500,
  });

  const groups = new Map<string, typeof pending>();
  for (const m of pending) {
    const key = `${m.userId}:${m.canal}`;
    const list = groups.get(key) || [];
    list.push(m);
    groups.set(key, list);
  }

  let sent = 0;
  for (const [key, items] of groups) {
    const [userId, canal] = key.split(":") as [string, string];
    if (!isExternalChannel(canal)) continue;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (!user) continue;

    let dest: DecryptedDestination | null = null;
    if (canal === "email") {
      if (!user.email) continue;
      dest = { kind: "email", email: user.email };
    } else {
      const canalRow = items.find((i) => i.canalUsuarioId)?.canalUsuarioId;
      if (!canalRow) continue;
      const plain = await decryptCanalDestino(canalRow);
      if (!plain) continue;
      dest =
        plain.canal === "telegram"
          ? { kind: "telegram", chatId: plain.chatId }
          : { kind: "push", subscription: plain.subscription };
    }

    const provider = await getProvider(
      canal === "email" ? "email" : canal === "push" ? "webpush" : canal
    );
    if (!provider || !dest) continue;

    const rendered = renderDigest({
      nombre: user.name || user.email || "usuario",
      appUrl: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "",
      items: items.map((i) => {
        const payload = JSON.parse(i.payloadJson || "{}") as {
          title?: string;
          body?: string;
        };
        return {
          title: payload.title || i.plantilla,
          body: payload.body || "",
          seccion: tipoDef(i.plantilla).seccion,
        };
      }),
    });

    const result = await provider.send(rendered, dest);
    const ids = items.map((i) => i.id);
    if (result.ok) {
      await prisma.mensajeSaliente.updateMany({
        where: { id: { in: ids } },
        data: {
          estado: "enviado",
          enviadoAt: now,
          proveedor: provider.id,
          proveedorMessageId: result.providerMessageId || null,
        },
      });
      sent += 1;
    } else {
      await prisma.mensajeSaliente.updateMany({
        where: { id: { in: ids } },
        data: {
          estado: "fallido",
          error: result.error.slice(0, 500),
          proximoIntentoAt: new Date(now.getTime() + 60 * 60_000),
        },
      });
    }
  }

  return { sent, groups: groups.size };
}
