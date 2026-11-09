/** Reference to the Host's grant, never a second copy of Google credentials. */
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/auth/rbac";
import { httpError } from "@/lib/auth/access";
import { ensureGoogleAccessToken, getGoogleConfig, isGoogleIntegrationEnabled } from "./google";
export const STUDY_GMAIL_REFERENCE = "google-study-reference:v1";
export async function connectStudyGmail(userId: string) {
  const actor = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!isAdmin(actor)) throw httpError("Sólo la administración puede usar el buzón compartido del estudio", 403);
  const config = await getGoogleConfig();
  if (!await isGoogleIntegrationEnabled() || !config.accessToken || !config.connectedEmail || !config.scopes.includes("https://www.googleapis.com/auth/gmail.readonly")) return false;
  const old = await prisma.mailboxAccount.findUnique({ where: { userId } });
  // Preserve an explicitly configured different mailbox and its history.
  if (old?.status === "connected" && (old.protocol !== "gmail" || old.email !== config.connectedEmail)) return false;
  const data = { protocol: "gmail", status: "connected", email: config.connectedEmail, oauthAccessEnc: null, oauthRefreshEnc: STUDY_GMAIL_REFERENCE, oauthExpiresAt: null, passwordEnc: null, lastError: null };
  await prisma.mailboxAccount.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return true;
}
export async function studyGmailToken(userId: string, expectedEmail: string | null) {
  const actor = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!isAdmin(actor) || !await isGoogleIntegrationEnabled()) throw httpError("La conexión compartida de Gmail ya no está autorizada", 403);
  const config = await ensureGoogleAccessToken();
  if (!config.accessToken || !expectedEmail || config.connectedEmail !== expectedEmail || !config.scopes.includes("https://www.googleapis.com/auth/gmail.readonly")) throw httpError("Revisa la cuenta de Google del estudio y el permiso de lectura de Gmail", 409);
  return config.accessToken;
}
