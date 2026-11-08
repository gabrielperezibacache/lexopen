import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { notificationTransaction } from "./transaction";
import { encryptSecret, hashDestino, randomToken, sha256Hex } from "./secrets";
import { e164 } from "./whatsapp-config";

export function equalSignature(actual: string, expected: string) {
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function verifyMetaSignature(raw: string, signature: string, secret: string) {
  return equalSignature(signature, `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
}
export function verifyTwilioSignature(url: string, params: URLSearchParams, signature: string, secret: string) {
  // Reject duplicate fields rather than interpreting a signed payload ambiguously.
  if ([...new Set(params.keys())].some(key => params.getAll(key).length !== 1)) return false;
  const text = url + [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => k + v).join("");
  return equalSignature(signature, createHmac("sha1", secret).update(text).digest("base64"));
}
export async function createWhatsAppLink(userId: string) {
  return notificationTransaction(prisma, async tx => {
    await tx.canalUsuario.deleteMany({ where: { userId, canal: "whatsapp", estado: "pendiente" } });
    const code = randomToken(24), expiresAt = new Date(Date.now() + 15 * 60_000);
    await tx.canalUsuario.create({ data: { userId, canal: "whatsapp", destinoEnc: "", destinoHash: `pendiente:${randomToken(16)}`, estado: "pendiente", nivelDetalle: "minimo", codigoHash: sha256Hex(code), codigoExpiraAt: expiresAt } });
    return { code, expiresAt };
  });
}
/** Called only after validating the provider signature and receiving business account. */
export async function receiveWhatsAppLink(from: string, text: string) {
  if (!e164.test(from)) return false;
  if (/^(STOP|BAJA)$/i.test(text.trim())) {
    await prisma.canalUsuario.updateMany({ where: { canal: "whatsapp", destinoHash: hashDestino("whatsapp", from), estado: "activo" }, data: { estado: "revocado" } });
    return true;
  }
  const code = /^LEXOPEN ([A-Za-z0-9_-]{32})$/.exec(text.trim())?.[1];
  if (!code) return false;
  return notificationTransaction(prisma, async tx => {
    const now = new Date(), codigoHash = sha256Hex(code);
    const row = await tx.canalUsuario.findFirst({ where: { canal: "whatsapp", estado: "pendiente", codigoHash, codigoExpiraAt: { gt: now } } });
    if (!row) return false;
    const destinoHash = hashDestino("whatsapp", from);
    const existing = await tx.canalUsuario.findUnique({ where: { canal_destinoHash: { canal: "whatsapp", destinoHash } } });
    if (existing && existing.userId !== row.userId) return false;
    const consumed = await tx.canalUsuario.updateMany({ where: { id: row.id, estado: "pendiente", codigoHash, codigoExpiraAt: { gt: now } }, data: { codigoHash: null, codigoExpiraAt: null } });
    if (!consumed.count) return false;
    const data = { destinoEnc: encryptSecret(from), destinoHash, estado: "activo", verificadoAt: now, nivelDetalle: "minimo", codigoHash: null, codigoExpiraAt: null, ultimoError: null, ultimoErrorAt: null };
    // One telephone per user. Relinking explicitly replaces their prior destination.
    await tx.canalUsuario.updateMany({ where: { userId: row.userId, canal: "whatsapp", estado: "activo", id: { not: existing?.id || row.id } }, data: { estado: "revocado" } });
    if (existing && existing.id !== row.id) {
      await tx.canalUsuario.update({ where: { id: existing.id }, data });
      await tx.canalUsuario.delete({ where: { id: row.id } });
    } else await tx.canalUsuario.update({ where: { id: row.id }, data });
    return true;
  });
}
