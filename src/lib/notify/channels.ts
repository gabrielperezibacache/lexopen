import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { notificationTransaction } from "@/lib/notify/transaction";
import type { ExternalChannel, NivelDetalle } from "@/lib/notify/catalog";
import { isNivelDetalle } from "@/lib/notify/catalog";
import {
  decryptSecret,
  encryptSecret,
  hashDestino,
  randomToken,
  sha256Hex,
} from "@/lib/notify/secrets";
import type { Destino, PerfilNotif, PrefRow } from "@/lib/notify/preferences";
import { DEFAULT_PERFIL } from "@/lib/notify/preferences";
import { isAllowedPushEndpoint, isValidPushKeys } from "@/lib/notify/providers/webpush";
import type { PushSubscriptionJSON } from "@/lib/notify/providers/types";

export async function loadPerfil(userId: string, client: Prisma.TransactionClient = prisma): Promise<PerfilNotif> {
  const row = await client.perfilNotificacion.findUnique({ where: { userId } });
  if (!row) return { ...DEFAULT_PERFIL };
  return {
    quietDesde: row.quietDesde,
    quietHasta: row.quietHasta,
    quietFinesSemana: row.quietFinesSemana,
    zonaHoraria: row.zonaHoraria,
    nivelEmail: isNivelDetalle(row.nivelEmail) ? row.nivelEmail : "estandar",
    silenciadoHasta: row.silenciadoHasta,
  };
}

export async function loadPrefs(userId: string, client: Prisma.TransactionClient = prisma): Promise<PrefRow[]> {
  const rows = await client.preferenciaNotificacion.findMany({
    where: { userId },
    select: { tipo: true, canal: true, modo: true },
  });
  return rows;
}

export async function loadDestinos(userId: string, client: Prisma.TransactionClient = prisma): Promise<{
  destinos: Destino[];
  email: string | null;
}> {
  const [user, canales] = await Promise.all([
    client.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
    client.canalUsuario.findMany({
      where: { userId, estado: "activo" },
      select: { id: true, canal: true, nivelDetalle: true },
    }),
  ]);

  const destinos: Destino[] = [];
  if (user?.email) {
    const perfil = await loadPerfil(userId, client);
    destinos.push({
      canal: "email",
      canalUsuarioId: null,
      nivel: perfil.nivelEmail,
    });
  }
  for (const c of canales) {
    if (c.canal !== "telegram" && c.canal !== "push") continue;
    destinos.push({
      canal: c.canal as ExternalChannel,
      canalUsuarioId: c.id,
      nivel: isNivelDetalle(c.nivelDetalle) ? c.nivelDetalle : "minimo",
    });
  }
  return { destinos, email: user?.email || null };
}

export async function decryptCanalDestino(canalUsuarioId: string, client: Prisma.TransactionClient = prisma): Promise<
  | { canal: "telegram"; chatId: string }
  | { canal: "push"; subscription: PushSubscriptionJSON }
  | null
> {
  const row = await client.canalUsuario.findUnique({ where: { id: canalUsuarioId } });
  if (!row || row.estado !== "activo" || !row.destinoEnc) return null;
  const plain = decryptSecret(row.destinoEnc);
  if (!plain) return null;
  if (row.canal === "telegram") return { canal: "telegram", chatId: plain };
  if (row.canal === "push") {
    try {
      const sub = JSON.parse(plain) as PushSubscriptionJSON;
      if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return null;
      return { canal: "push", subscription: sub };
    } catch {
      return null;
    }
  }
  return null;
}

const LINK_TTL_MS = 15 * 60_000;

/** Crea código de un uso para vincular Telegram (15 min). */
export async function createTelegramLinkCode(userId: string) {
  await prisma.canalUsuario.deleteMany({
    where: { userId, canal: "telegram", estado: "pendiente" },
  });
  const code = randomToken(16);
  const pending = `pendiente:${randomToken(12)}`;
  const row = await prisma.canalUsuario.create({
    data: {
      userId,
      canal: "telegram",
      destinoEnc: "",
      destinoHash: pending,
      estado: "pendiente",
      nivelDetalle: "minimo",
      codigoHash: sha256Hex(code),
      codigoExpiraAt: new Date(Date.now() + LINK_TTL_MS),
    },
  });
  return { id: row.id, code, expiresAt: row.codigoExpiraAt! };
}

export async function completeTelegramLink(opts: { code: string; chatId: string }) {
  if (!/^\d+$/.test(opts.chatId)) return { ok: false as const, error: "se requiere un chat privado" };
  return notificationTransaction(prisma, async tx => {
    const now = new Date(), hash = sha256Hex(opts.code);
    const row = await tx.canalUsuario.findFirst({ where: { canal: "telegram", estado: "pendiente",
      codigoHash: hash, codigoExpiraAt: { gt: now } } });
    if (!row) return { ok: false as const, error: "código inválido o expirado" };
    const destinoHash = hashDestino("telegram", opts.chatId);
    const existing = await tx.canalUsuario.findUnique({ where: { canal_destinoHash: { canal: "telegram", destinoHash } } });
    if (existing && existing.userId !== row.userId) return { ok: false as const, error: "chat ya vinculado a otro usuario" };
    const consumed = await tx.canalUsuario.updateMany({ where: { id: row.id, estado: "pendiente", codigoHash: hash, codigoExpiraAt: { gt: now } },
      data: { codigoHash: null, codigoExpiraAt: null } });
    if (!consumed.count) return { ok: false as const, error: "código ya utilizado" };
    const data = { destinoEnc: encryptSecret(opts.chatId), destinoHash, estado: "activo", verificadoAt: now,
      codigoHash: null, codigoExpiraAt: null, ultimoError: null, ultimoErrorAt: null };
    if (existing && existing.id !== row.id) {
      await tx.canalUsuario.update({ where: { id: existing.id }, data });
      await tx.canalUsuario.delete({ where: { id: row.id } });
    } else await tx.canalUsuario.update({ where: { id: row.id }, data });
    return { ok: true as const, userId: row.userId };
  });
}

export async function upsertPushSubscription(opts: {
  userId: string;
  subscription: PushSubscriptionJSON;
  nivel?: NivelDetalle;
}) {
  if (!isAllowedPushEndpoint(opts.subscription.endpoint) || !isValidPushKeys(opts.subscription.keys)) throw Object.assign(new Error("Destino push no permitido"), { status: 400 });
  const destinoHash = hashDestino("push", opts.subscription.endpoint);
  const enc = encryptSecret(JSON.stringify(opts.subscription));
  const existing = await prisma.canalUsuario.findFirst({
    where: { canal: "push", destinoHash },
  });
  if (existing) {
    if (existing.userId !== opts.userId) throw Object.assign(new Error("Destino push ya vinculado"), { status: 409 });
    return prisma.canalUsuario.update({
      where: { id: existing.id },
      data: {
        userId: opts.userId,
        destinoEnc: enc,
        estado: "activo",
        verificadoAt: new Date(),
        nivelDetalle: opts.nivel || existing.nivelDetalle,
        ultimoError: null,
        ultimoErrorAt: null,
      },
    });
  }
  return prisma.canalUsuario.create({
    data: {
      userId: opts.userId,
      canal: "push",
      destinoEnc: enc,
      destinoHash,
      estado: "activo",
      nivelDetalle: opts.nivel || "minimo",
      verificadoAt: new Date(),
    },
  });
}

export async function revokeCanal(opts: {
  userId: string;
  canal: "telegram" | "push";
  id?: string;
}) {
  return prisma.canalUsuario.updateMany({
    where: {
      userId: opts.userId,
      canal: opts.canal,
      ...(opts.id ? { id: opts.id } : {}),
      estado: { not: "revocado" },
    },
    data: { estado: "revocado", updatedAt: new Date() },
  });
}

export async function markCanalBlocked(canalUsuarioId: string, error: string) {
  await prisma.canalUsuario.update({
    where: { id: canalUsuarioId },
    data: {
      estado: "bloqueado",
      ultimoError: error.slice(0, 500),
      ultimoErrorAt: new Date(),
    },
  });
}
