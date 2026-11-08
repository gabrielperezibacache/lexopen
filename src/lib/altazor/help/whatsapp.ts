import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { altazorActor, altazorTransaction } from "../access";
import { decryptSecret, encryptSecret, hashDestino, randomToken, sha256Hex } from "@/lib/notify/secrets";
import { parseWhatsAppInbound, verifyWhatsAppSignature } from "@/lib/notify/providers/whatsapp";
import { getWhatsAppMetaConfig } from "./config";
import { acceptWhatsAppHelpReply } from "./service";

export async function createWhatsAppHelpLink(user: { id: string }, client: PrismaClient = prisma) {
  const meta = await getWhatsAppMetaConfig(client);
  if (!meta) throw httpError("La administración debe conectar WhatsApp Meta en este Host.", 409);
  return altazorTransaction(client, async tx => {
    const actor = await tx.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
    if (!actor || !can(actor, "notify.channels.self")) throw httpError("No tiene permiso para vincular avisos.", 403);
    await altazorActor(actor, tx);
    await tx.canalUsuario.deleteMany({ where: { userId: actor.id, canal: "whatsapp", estado: "pendiente" } });
    const code = randomToken(18), expiresAt = new Date(Date.now() + 15 * 60_000);
    await tx.canalUsuario.create({ data: { userId: actor.id, canal: "whatsapp", estado: "pendiente", destinoHash: `pendiente:${randomToken(18)}`, codigoHash: sha256Hex(code), codigoExpiraAt: expiresAt, etiqueta: "WhatsApp · ayuda de Altazor" } });
    return { code, expiresAt: expiresAt.toISOString(), displayPhone: meta.displayPhone || null, message: `ALTAZOR VINCULAR ${code}` };
  });
}

async function completeWhatsAppLink(code: string, from: string, client: PrismaClient) {
  return altazorTransaction(client, async tx => {
    const now = new Date(), codigoHash = sha256Hex(code);
    const pending = await tx.canalUsuario.findFirst({ where: { canal: "whatsapp", estado: "pendiente", codigoHash, codigoExpiraAt: { gt: now } } });
    if (!pending) return false;
    const actor = await tx.user.findUnique({ where: { id: pending.userId }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
    if (!actor || !can(actor, "notify.channels.self")) return false;
    await altazorActor(actor, tx);
    const phone = `+${from}`, destinoHash = hashDestino("whatsapp", phone);
    const existing = await tx.canalUsuario.findUnique({ where: { canal_destinoHash: { canal: "whatsapp", destinoHash } } });
    if (existing && existing.userId !== actor.id) return false;
    const consumed = await tx.canalUsuario.updateMany({ where: { id: pending.id, estado: "pendiente", codigoHash, codigoExpiraAt: { gt: now } }, data: { codigoHash: null, codigoExpiraAt: null } });
    if (!consumed.count) return false;
    const data = { destinoEnc: encryptSecret(phone), destinoHash, estado: "activo", verificadoAt: now, codigoHash: null, codigoExpiraAt: null, etiqueta: `WhatsApp · •••${from.slice(-4)}` };
    if (existing && existing.id !== pending.id) { await tx.canalUsuario.update({ where: { id: existing.id }, data }); await tx.canalUsuario.delete({ where: { id: pending.id } }); }
    else await tx.canalUsuario.update({ where: { id: pending.id }, data });
    return true;
  });
}

export async function revokeWhatsAppHelpLink(user: { id: string }, channelId: string, client: PrismaClient = prisma) {
  await client.canalUsuario.updateMany({ where: { id: channelId, userId: user.id, canal: "whatsapp" }, data: { estado: "revocado", codigoHash: null, codigoExpiraAt: null } });
  return { ok: true };
}

export async function processWhatsAppHelpWebhook(raw: string, signature: string | null, client: PrismaClient = prisma) {
  const config = await getWhatsAppMetaConfig(client);
  if (!config || !verifyWhatsAppSignature(raw, signature, config.appSecret)) throw httpError("Firma de WhatsApp no válida.", 401);
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw httpError("JSON no válido.", 400); }
  let accepted = 0, linked = 0;
  for (const message of parseWhatsAppInbound(input)) {
    if (message.phoneNumberId !== config.phoneNumberId || message.timestamp * 1000 > Date.now() + 60_000 || message.timestamp * 1000 < Date.now() - 24 * 60 * 60_000) continue;
    const match = /^ALTAZOR\s+VINCULAR\s+([A-Za-z0-9_-]{24})$/i.exec(message.text.trim());
    if (match) { try { if (await completeWhatsAppLink(match[1], message.from, client)) linked++; } catch { /* A revoked or already claimed account cannot bind a phone. */ } continue; }
    const channel = await client.canalUsuario.findUnique({ where: { canal_destinoHash: { canal: "whatsapp", destinoHash: hashDestino("whatsapp", `+${message.from}`) } } });
    if (!channel || channel.estado !== "activo" || !channel.verificadoAt || decryptSecret(channel.destinoEnc) !== `+${message.from}`) continue;
    try { const result = await acceptWhatsAppHelpReply(channel.userId, { text: message.text, messageId: message.id, timestamp: message.timestamp, contextId: message.contextId, channelId: channel.id }, client); if (result.accepted) accepted++; } catch { /* Duplicate, expired, forbidden and uncorrelated replies never advance work. */ }
  }
  return { accepted, linked };
}
