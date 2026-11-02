import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import { generateBackupCodes, generateTotpSecret, hashBackupCodes, sealTotpSecret, unsealTotpSecret, verifyTotpCode } from "@/lib/auth/totp";
import { prisma } from "@/lib/db";

export const TOTP_ENROLLMENT_COOKIE = "lexopen_totp_enrollment";
const TTL_MS = 10 * 60 * 1000;
type Enrollment = { userId: string; version: number; previousSecret: string | null; enabled: boolean; secret: string; expires: number };

export function readEnrollment(token: string | undefined, userId: string, version: number): Enrollment {
  let value: Enrollment | null = null;
  try { value = JSON.parse(unsealTotpSecret(token) || "null"); } catch { /* invalid ciphertext */ }
  if (!value || value.userId !== userId || value.version !== version || value.expires <= Date.now() || typeof value.secret !== "string") {
    throw httpError("Configuración 2FA expirada. Iníciela de nuevo.", 409);
  }
  return value;
}

/** Preparing enrollment never changes or disables an active factor. */
export async function prepareTotpEnrollment(userId: string, version: number, currentCode?: string, client = prisma) {
  const user = await client.user.findUnique({ where: { id: userId } });
  if (!user || user.sessionVersion !== version) throw httpError("Sesión expirada", 401);
  if (user.totpEnabled) {
    const current = unsealTotpSecret(user.totpSecretEnc);
    if (!current || !currentCode || !verifyTotpCode(current, currentCode)) throw httpError("Se requiere el código 2FA actual para reconfigurar", 403);
  }
  const secret = generateTotpSecret();
  const token = sealTotpSecret(JSON.stringify({ userId, version, previousSecret: user.totpSecretEnc, enabled: user.totpEnabled, secret, expires: Date.now() + TTL_MS } satisfies Enrollment));
  return { secret, token };
}

export async function confirmTotpEnrollment(token: string | undefined, userId: string, version: number, code: string, client = prisma) {
  const pending = readEnrollment(token, userId, version);
  if (!verifyTotpCode(pending.secret, code)) throw httpError("Código inválido", 400);
  const backupCodes = generateBackupCodes(8);
  const backupJson = await hashBackupCodes(backupCodes);
  const user = await client.$transaction(async (tx) => {
    const changed = await tx.user.updateMany({ where: { id: userId, sessionVersion: version, totpSecretEnc: pending.previousSecret, totpEnabled: pending.enabled }, data: { totpEnabled: true, totpSecretEnc: sealTotpSecret(pending.secret), totpBackupCodes: backupJson, sessionVersion: { increment: 1 } } });
    if (changed.count !== 1) throw httpError("El factor o la sesión cambió. Reinicie la configuración.", 409);
    await writeAuditStrict({ actorId: userId, action: "auth.totp_enable", entityType: "User", entityId: userId }, tx);
    return tx.user.findUniqueOrThrow({ where: { id: userId } });
  });
  return { user, backupCodes };
}
