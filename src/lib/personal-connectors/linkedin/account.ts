import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { PersonalConnectorAccount } from "@prisma/client";
import { accountContext, attemptContext, ConnectorError, digest, randomToken, seal, unseal } from "../core";
import type { PublicLinkedInAccount } from "../types";
import { linkedInConfig, requireLinkedInConfig } from "./config";
import { authorizationUrl, exchangeLinkedInCode, providerJson, type LinkedInGrant } from "./oauth";

export type ConnectorActor = { id: string; sessionVersion: number; sessionHash: string };
const nativeReason = "La conexión nativa PKCE aún no está habilitada. Use una aplicación LinkedIn registrada con retorno web HTTPS.";
const accountWhere = (ownerId: string) => ({ ownerId_provider: { ownerId, provider: "linkedin" } });
export function publicLinkedInAccount(account: PersonalConnectorAccount | null, pending = false): PublicLinkedInAccount {
  const config = linkedInConfig();
  let state: PublicLinkedInAccount["state"] = "disconnected", reason: string | null = null;
  let scopes: string[] | null = null, canVerify = false;
  if (account?.grantedScopesJson) {
    try { const parsed: unknown = JSON.parse(account.grantedScopesJson); if (Array.isArray(parsed) && parsed.every(scope => typeof scope === "string")) scopes = parsed; } catch { /* Unknown permissions remain unknown. */ }
  }
  if (!config.configured) { state = "unconfigured"; reason = config.reason; }
  else if (pending) state = "connecting";
  else if (account && account.status !== "disconnected") {
    if (account.clientId !== config.clientId || !account.credentialsEnc) { state = "reconnect_required"; reason = "Vuelva a conectar su cuenta de LinkedIn."; }
    else if (!account.expiresAt || account.expiresAt.getTime() <= Date.now() + 30_000) { state = "expired"; reason = "La autorización venció. Vuelva a conectar LinkedIn."; }
    else {
      try {
        const grant = unseal<LinkedInGrant>(account.credentialsEnc, accountContext(account.ownerId, account.id));
        if (!grant.accessToken || grant.subject !== account.externalSubject) throw new Error();
        canVerify = true;
        state = account.status === "reconnect_required" ? "reconnect_required" : !account.lastVerifiedAt || Date.now() - account.lastVerifiedAt.getTime() > 15 * 60_000 ? "verification_required" : "connected";
        if (state === "verification_required") reason = "Compruebe la autorización antes de publicar.";
        if (state === "reconnect_required") reason = "LinkedIn requiere una autorización nueva.";
      } catch { state = "reconnect_required"; reason = "No se pudo abrir la autorización. Desconecte y vuelva a conectar LinkedIn."; }
    }
  }
  const connected = state === "connected";
  return { provider: "linkedin", state, connected, canStartOAuth: config.configured, canVerify, canPublish: connected && config.shareEnabled && Boolean(scopes?.includes("w_member_social")), canRequestPublish: config.configured && config.shareEnabled, availableModes: config.configured ? ["web"] : [], nativeAvailable: false, nativeReason, grantedScopes: scopes, identity: account && account.status !== "disconnected" ? { name: account.name, email: account.email } : null, expiresAt: account?.expiresAt?.toISOString() || null, lastVerifiedAt: account?.lastVerifiedAt?.toISOString() || null, reason: reason || (connected && !config.shareEnabled ? "La publicación por API no está habilitada en este Host. Puede copiar su borrador y abrir LinkedIn." : connected && !scopes?.includes("w_member_social") ? "La autorización permite identificar su cuenta; no incluye permiso comprobado para publicar." : null) };
}
export async function linkedInStatus(ownerId: string) {
  const [account, pending] = await Promise.all([
    prisma.personalConnectorAccount.findUnique({ where: accountWhere(ownerId) }),
    prisma.personalOAuthAttempt.findFirst({ where: { ownerId, provider: "linkedin", phase: { in: ["pending", "exchanging", "ready"] }, expiresAt: { gt: new Date() } }, select: { id: true } }),
  ]);
  return publicLinkedInAccount(account, Boolean(pending));
}
export async function startLinkedInOAuth(actor: ConnectorActor, purpose: "identity" | "publish", mode: "web" | "native") {
  if (mode !== "web") throw new ConnectorError("native_unavailable", nativeReason, 409);
  const config = requireLinkedInConfig();
  if (purpose === "publish" && !config.shareEnabled) throw new ConnectorError("publishing_unconfigured", "El administrador debe habilitar Share on LinkedIn para esta aplicación antes de solicitar permiso para publicar.", 503);
  const state = randomToken(), nonce = randomToken(), id = randomUUID(), expiresAt = new Date(Date.now() + 10 * 60_000);
  const authorization = authorizationUrl(config, state, nonce, purpose === "publish");
  await prisma.personalOAuthAttempt.updateMany({ where: { ownerId: actor.id, provider: "linkedin", phase: { in: ["pending", "ready"] } }, data: { phase: "cancelled", resultEnc: null } });
  await prisma.personalOAuthAttempt.create({ data: { id, ownerId: actor.id, provider: "linkedin", stateHash: digest(state), sessionHash: actor.sessionHash, sessionVersion: actor.sessionVersion, nonceHash: digest(nonce), requestedScopesJson: JSON.stringify(authorization.scopes), redirectUri: config.redirectUri, clientId: config.clientId, expiresAt } });
  return { attemptId: id, authUrl: authorization.url, expiresAt: expiresAt.toISOString() };
}
/** No browser session is required here: this only stages an encrypted result. */
export async function receiveLinkedInCallback(input: { state: string; code?: string; denied?: boolean }) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.state)) throw new ConnectorError("invalid_state", "La conexión no pudo verificarse. Iníciela otra vez.", 400);
  const attempt = await prisma.personalOAuthAttempt.findUnique({ where: { stateHash: digest(input.state) } });
  if (!attempt || attempt.provider !== "linkedin" || attempt.expiresAt.getTime() <= Date.now()) throw new ConnectorError("invalid_state", "El intento venció o ya no está disponible.", 400);
  const claimed = await prisma.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "pending", consumedAt: null, expiresAt: { gt: new Date() } }, data: { phase: "exchanging", consumedAt: new Date() } });
  if (!claimed.count) throw new ConnectorError("state_consumed", "Este retorno ya se utilizó. Vuelva a la ventana original.", 409);
  try {
    if (input.denied || !input.code || input.code.length > 8000) throw new ConnectorError("authorization_cancelled", "No se autorizó la conexión.");
    const config = requireLinkedInConfig();
    if (config.clientId !== attempt.clientId || config.redirectUri !== attempt.redirectUri) throw new ConnectorError("configuration_changed", "La configuración cambió. Inicie una conexión nueva.", 409);
    const grant = await exchangeLinkedInCode(config, input.code, attempt.nonceHash);
    const staged = await prisma.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "exchanging", expiresAt: { gt: new Date() } }, data: { phase: "ready", resultEnc: seal(grant, attemptContext(attempt.ownerId, attempt.id)), errorCode: null } });
    if (!staged.count) throw new ConnectorError("attempt_cancelled", "El intento fue cancelado o venció. Inicie otra conexión.", 409);
  } catch (error) {
    await prisma.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "exchanging" }, data: { phase: "failed", resultEnc: null, errorCode: error instanceof ConnectorError ? error.code : "oauth_failed" } });
    throw error;
  }
}
export async function completeLinkedInOAuth(actor: ConnectorActor, attemptId: string) {
  const config = requireLinkedInConfig();
  await prisma.$transaction(async tx => {
    const attempt = await tx.personalOAuthAttempt.findFirst({ where: { id: attemptId, ownerId: actor.id, provider: "linkedin", sessionHash: actor.sessionHash, sessionVersion: actor.sessionVersion, expiresAt: { gt: new Date() } } });
    if (!attempt) throw new ConnectorError("attempt_unavailable", "Esta conexión no pertenece a la sesión actual o venció. Inicie otra.", 404);
    if (attempt.phase === "completed") return;
    if (attempt.phase !== "ready" || !attempt.resultEnc) throw new ConnectorError(attempt.errorCode || "authorization_pending", attempt.phase === "failed" ? "LinkedIn no completó la autorización. Inicie una conexión nueva." : "Termine la autorización en LinkedIn y vuelva a comprobarla aquí.", 409);
    if (attempt.clientId !== config.clientId || attempt.redirectUri !== config.redirectUri) throw new ConnectorError("configuration_changed", "La configuración cambió. Inicie una conexión nueva.", 409);
    const grant = unseal<LinkedInGrant>(attempt.resultEnc, attemptContext(actor.id, attempt.id));
    const existing = await tx.personalConnectorAccount.findUnique({ where: accountWhere(actor.id) });
    const id = existing?.id || randomUUID();
    const claimed = await tx.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "ready", completedAt: null }, data: { phase: "completed", completedAt: new Date(), resultEnc: null } });
    if (!claimed.count) throw new ConnectorError("attempt_consumed", "La conexión ya se completó. Actualice su estado.", 409);
    const data = { clientId: config.clientId, externalSubject: grant.subject, name: grant.name, email: grant.email, pictureUrl: null, status: "connected", grantedScopesJson: grant.scopes ? JSON.stringify(grant.scopes) : null, credentialsEnc: seal(grant, accountContext(actor.id, id)), expiresAt: new Date(grant.expiresAt), lastVerifiedAt: new Date(), lastErrorCode: null };
    await tx.personalConnectorAccount.upsert({ where: accountWhere(actor.id), create: { id, ownerId: actor.id, provider: "linkedin", ...data }, update: data });
  });
  return linkedInStatus(actor.id);
}
export async function verifyLinkedInAccount(ownerId: string) {
  const config = requireLinkedInConfig(), account = await prisma.personalConnectorAccount.findUnique({ where: accountWhere(ownerId) });
  if (!account || account.status === "disconnected" || account.clientId !== config.clientId || !account.credentialsEnc || !account.expiresAt || account.expiresAt.getTime() <= Date.now() + 30_000) throw new ConnectorError("needs_reconnect", "Conecte una autorización vigente antes de publicar.", 409);
  try {
    const grant = unseal<LinkedInGrant>(account.credentialsEnc, accountContext(ownerId, account.id));
    const profile = await providerJson("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${grant.accessToken}` } });
    if (profile.sub !== account.externalSubject) throw new ConnectorError("identity_changed", "La identidad de LinkedIn no coincide. Vuelva a conectar.", 409);
    const verified = await prisma.personalConnectorAccount.updateMany({ where: { id: account.id, credentialsEnc: account.credentialsEnc, status: { not: "disconnected" } }, data: { lastVerifiedAt: new Date(), status: "connected", lastErrorCode: null } });
    if (!verified.count) throw new ConnectorError("needs_reconnect", "La autorización cambió durante la comprobación. Actualice su conexión.", 409);
    const updated = await prisma.personalConnectorAccount.findUniqueOrThrow({ where: { id: account.id } });
    return { account: updated, grant, public: publicLinkedInAccount(updated) };
  } catch (error) {
    if (error instanceof ConnectorError && ["needs_reconnect", "identity_changed", "credentials_unreadable"].includes(error.code)) await prisma.personalConnectorAccount.updateMany({ where: { id: account.id, credentialsEnc: account.credentialsEnc, status: { not: "disconnected" } }, data: { status: "reconnect_required", lastErrorCode: error.code, lastVerifiedAt: null } });
    else await prisma.personalConnectorAccount.updateMany({ where: { id: account.id, credentialsEnc: account.credentialsEnc, status: { not: "disconnected" } }, data: { lastVerifiedAt: null, lastErrorCode: "verification_failed" } });
    throw error;
  }
}
export async function disconnectLinkedIn(ownerId: string) {
  await prisma.$transaction(async tx => {
    // Serialize with the short publication claim, never with the remote request.
    await tx.personalConnectorAccount.updateMany({ where: { ownerId, provider: "linkedin" }, data: { status: "disconnected", credentialsEnc: null, grantedScopesJson: null, expiresAt: null, lastVerifiedAt: null, lastErrorCode: null } });
    const sending = await tx.externalPublicationAttempt.findFirst({ where: { ownerId, status: "sending", createdAt: { gt: new Date(Date.now() - 60_000) } }, select: { id: true } });
    if (sending) throw new ConnectorError("publication_in_progress", "Espere a que termine el envío actual antes de desconectar LinkedIn.", 409);
    await tx.personalOAuthAttempt.updateMany({ where: { ownerId, provider: "linkedin", completedAt: null }, data: { phase: "cancelled", resultEnc: null } });
  });
  return linkedInStatus(ownerId);
}
