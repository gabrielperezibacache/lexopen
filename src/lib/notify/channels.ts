import { prisma } from "@/lib/db";
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
import type { PushSubscriptionJSON } from "@/lib/notify/providers/types";

export async function loadPerfil(userId: string): Promise<PerfilNotif> {
  const row = await prisma.perfilNotificacion.findUnique({ where: { userId } });
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

export async function loadPrefs(userId: string): Promise<PrefRow[]> {
  const rows = await prisma.preferenciaNotificacion.findMany({
    where: { userId },
    select: { tipo: true, canal: true, modo: true },
  });
  return rows;
}

export async function loadDestinos(userId: string): Promise<{
  destinos: Destino[];
  email: string | null;
}> {
  const [user, canales] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
    prisma.canalUsuario.findMany({
      where: { userId, estado: "activo" },
      select: { id: true, canal: true, nivelDetalle: true },
    }),
  ]);

  const destinos: Destino[] = [];
  if (user?.email) {
    const perfil = await loadPerfil(userId);
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

export async function decryptCanalDestino(canalUsuarioId: string): Promise<
  | { canal: "telegram"; chatId: string }
  | { canal: "push"; subscription: PushSubscriptionJSON }
  | null
> {
  const row = await prisma.canalUsuario.findUnique({ where: { id: canalUsuarioId } });
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

export async function completeTelegramLink(opts: {
  code: string;
  chatId: string;
}) {
  const hash = sha256Hex(opts.code);
  const row = await prisma.canalUsuario.findFirst({
    where: {
      canal: "telegram",
      estado: "pendiente",
      codigoHash: hash,
      codigoExpiraAt: { gt: new Date() },
    },
  });
  if (!row) return { ok: false as const, error: "código inválido o expirado" };

  const destinoHash = hashDestino("telegram", opts.chatId);
  const existing = await prisma.canalUsuario.findFirst({
    where: { canal: "telegram", destinoHash, estado: "activo" },
  });
  if (existing && existing.userId !== row.userId) {
    return { ok: false as const, error: "chat ya vinculado a otro usuario" };
  }

  await prisma.canalUsuario.update({
    where: { id: row.id },
    data: {
      destinoEnc: encryptSecret(opts.chatId),
      destinoHash,
      estado: "activo",
      verificadoAt: new Date(),
      codigoHash: null,
      codigoExpiraAt: null,
      ultimoError: null,
      ultimoErrorAt: null,
    },
  });
  return { ok: true as const, userId: row.userId };
}

export async function upsertPushSubscription(opts: {
  userId: string;
  subscription: PushSubscriptionJSON;
  nivel?: NivelDetalle;
}) {
  const destinoHash = hashDestino("push", opts.subscription.endpoint);
  const enc = encryptSecret(JSON.stringify(opts.subscription));
  const existing = await prisma.canalUsuario.findFirst({
    where: { canal: "push", destinoHash },
  });
  if (existing) {
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
