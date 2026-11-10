import { computerSessionExpired, activeComputerSessionWhere } from "../computer/lifecycle";
import { randomUUID } from "node:crypto";
import type { AltazorSecret, AltazorSecretGrant, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { altazorActor, altazorScopeKey, altazorTransaction } from "@/lib/altazor/access";
import { assertCausaAccess, type CausaAccessUser } from "@/lib/auth/causa-access";
import { normalizeAssistantFirmPolicy } from "@/lib/assistant/firm-policy";
import { assertComputerEnabled } from "@/lib/altazor/computer/policy";
import { assertComputerPolicy } from "@/lib/altazor/computer/privacy";
import { constantEqual } from "@/lib/personal-connectors/core";
import { decryptSecret, encryptSecret, secretReceipt, SecretError } from "./crypto";
import { createSecretSchema, deleteSecretSchema, normalizeSecretTarget, prepareSecretUseSchema, rotateSecretSchema, SECRET_LIMITS, secretIdSchema, type CreateSecretInput, type DeleteSecretInput, type PrepareSecretUseInput, type RotateSecretInput, type SecretTarget } from "./policy";
import type { SecretMetadata, SecretOptions, SecretUseGrant, SecretUseOptions } from "./types";

type Client = PrismaClient | Prisma.TransactionClient;
const metadataSelect = { id: true, name: true, provider: true, username: true, kind: true, revision: true, createdAt: true, updatedAt: true } as const;
type MetadataRow = Pick<AltazorSecret, keyof typeof metadataSelect>;
const metadata = (row: MetadataRow): SecretMetadata => ({ id: row.id, name: row.name, provider: row.provider, username: row.username, kind: row.kind, revision: row.revision, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
const clock = (options: SecretOptions) => options.now?.() ?? Date.now();
const database = (options: SecretOptions) => options.client || prisma;
const missing = () => new SecretError("secret_not_found", "Secreto no encontrado o sin acceso actual.", 404);
const changed = () => new SecretError("secret_changed", "El secreto cambió. Actualice Secretos antes de continuar.", 409);
function receiptMatches(receipt: { kind: string; inputHash: string }, kind: string, hash: string) {
  if (receipt.kind !== kind || !constantEqual(receipt.inputHash, hash)) throw new SecretError("secret_request_reused", "Esta solicitud ya se utilizó para otra operación. Actualice el formulario.", 409);
}
async function secretFor(db: Client, ownerId: string, id: string) {
  const row = await db.altazorSecret.findFirst({ where: { id, ownerId }, select: metadataSelect });
  if (!row) throw missing();
  return row;
}
export async function listSecrets(user: CausaAccessUser, options: SecretOptions = {}): Promise<SecretMetadata[]> {
  const db = database(options), actor = await altazorActor(user, db);
  return (await db.altazorSecret.findMany({ where: { ownerId: actor.id }, select: metadataSelect, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: SECRET_LIMITS.perOwner })).map(metadata);
}
export async function getSecret(user: CausaAccessUser, id: string, options: SecretOptions = {}): Promise<SecretMetadata> {
  secretIdSchema.parse(id);
  const db = database(options), actor = await altazorActor(user, db);
  return metadata(await secretFor(db, actor.id, id));
}
export async function createSecret(user: CausaAccessUser, input: CreateSecretInput, options: SecretOptions = {}) {
  const body = createSecretSchema.parse(input), db = database(options), actor = await altazorActor(user, db);
  const hash = secretReceipt(actor.id, "create", body, options.material);
  return altazorTransaction(db, async tx => {
    await altazorActor(user, tx);
    const receipt = await tx.altazorSecretReceipt.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId: body.requestId } } });
    if (receipt) { receiptMatches(receipt, "create", hash); return { secret: metadata(await secretFor(tx, actor.id, receipt.resourceId)), replayed: true }; }
    if (await tx.altazorSecret.count({ where: { ownerId: actor.id } }) >= SECRET_LIMITS.perOwner) throw new SecretError("secret_limit", "Su biblioteca de secretos alcanzó el límite. Elimine los que ya no utilice.", 409);
    const identity = { id: randomUUID(), ownerId: actor.id, revision: 1 };
    const row = await tx.altazorSecret.create({ data: { ...identity, name: body.name, provider: body.provider, username: body.username, kind: body.kind, ciphertext: encryptSecret(body.value, identity, options.material) }, select: metadataSelect });
    await tx.altazorSecretReceipt.create({ data: { ownerId: actor.id, requestId: body.requestId, kind: "create", inputHash: hash, resourceId: row.id } });
    return { secret: metadata(row), replayed: false };
  });
}
export async function rotateSecret(user: CausaAccessUser, id: string, input: RotateSecretInput, options: SecretOptions = {}) {
  secretIdSchema.parse(id);
  const body = rotateSecretSchema.parse(input), db = database(options), actor = await altazorActor(user, db);
  const hash = secretReceipt(actor.id, "rotate", { id, ...body }, options.material);
  return altazorTransaction(db, async tx => {
    await altazorActor(user, tx);
    const receipt = await tx.altazorSecretReceipt.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId: body.requestId } } });
    if (receipt) { receiptMatches(receipt, "rotate", hash); return { secret: metadata(await secretFor(tx, actor.id, id)), replayed: true }; }
    const current = await secretFor(tx, actor.id, id);
    if (current.revision !== body.revision) throw changed();
    const identity = { id, ownerId: actor.id, revision: body.revision + 1 };
    const updated = await tx.altazorSecret.updateMany({ where: { id, ownerId: actor.id, revision: body.revision }, data: { name: body.name, provider: body.provider, username: body.username, kind: body.kind, revision: identity.revision, ciphertext: encryptSecret(body.value, identity, options.material) } });
    if (!updated.count) throw changed();
    await tx.altazorSecretGrant.updateMany({ where: { secretId: id, ownerId: actor.id, state: { in: ["pending", "consuming"] } }, data: { state: "revoked" } });
    await tx.altazorSecretReceipt.create({ data: { ownerId: actor.id, requestId: body.requestId, kind: "rotate", inputHash: hash, resourceId: id } });
    return { secret: metadata(await secretFor(tx, actor.id, id)), replayed: false };
  });
}
export async function deleteSecret(user: CausaAccessUser, id: string, input: DeleteSecretInput, options: SecretOptions = {}) {
  secretIdSchema.parse(id);
  const body = deleteSecretSchema.parse(input), db = database(options), actor = await altazorActor(user, db);
  const hash = secretReceipt(actor.id, "delete", { id, ...body }, options.material);
  return altazorTransaction(db, async tx => {
    await altazorActor(user, tx);
    const receipt = await tx.altazorSecretReceipt.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId: body.requestId } } });
    if (receipt) { receiptMatches(receipt, "delete", hash); return { deleted: true as const, replayed: true }; }
    const current = await secretFor(tx, actor.id, id);
    if (current.revision !== body.revision) throw changed();
    // Physical deletion also cascades every grant; no ciphertext or old value is retained in receipts.
    const result = await tx.altazorSecret.deleteMany({ where: { id, ownerId: actor.id, revision: body.revision } });
    if (!result.count) throw changed();
    await tx.altazorSecretReceipt.create({ data: { ownerId: actor.id, requestId: body.requestId, kind: "delete", inputHash: hash, resourceId: id } });
    return { deleted: true as const, replayed: false };
  });
}

async function targetAccess(db: Client, user: CausaAccessUser, target: SecretTarget, options: SecretOptions) {
  assertComputerEnabled();
  const actor = await altazorActor(user, db), now = clock(options);
  const policy = normalizeAssistantFirmPolicy(await db.firmSettings.findFirst({ select: { assistantLlmMode: true } }));
  assertComputerPolicy(policy.assistantLlmMode);
  const session = await db.altazorComputerSession.findFirst({ where: { id: target.sessionId, ownerId: actor.id } });
  if (!session) throw new SecretError("secret_session_not_found", "Sesión no encontrada o sin acceso actual.", 404);
  if (session.state !== "ready" || !session.kittyId || !session.chatId || computerSessionExpired(session, now) || !session.held || now - session.updatedAt.getTime() >= SECRET_LIMITS.holdMs) throw new SecretError("secret_hold_required", "Abra el escritorio y tome el control manual antes de usar un secreto.", 409);
  const workspace = await db.altazorComputerWorkspace.findFirst({ where: { id: session.workspaceId, ownerId: actor.id } });
  if (!workspace || !workspace.enabled || !workspace.credentialEnc || workspace.scopeKey !== altazorScopeKey(workspace.causaId)) throw new SecretError("secret_workspace_unavailable", "El espacio de este escritorio ya no está disponible.", 409);
  if (workspace.causaId) await assertCausaAccess(workspace.causaId, actor, { auditOverride: false }, db);
  const sessionHash = secretReceipt(actor.id, "session", { sessionId: session.id, kittyId: session.kittyId, chatId: session.chatId, updatedAt: session.updatedAt.toISOString(), workspaceId: workspace.id, endpoint: workspace.endpoint, credentialEnc: workspace.credentialEnc, provider: workspace.providerName }, options.material);
  return { actor, session, workspace, sessionHash };
}
const grantView = (row: AltazorSecretGrant): SecretUseGrant => ({ id: row.id, secretId: row.secretId, revision: row.secretRevision, target: normalizeSecretTarget(JSON.parse(row.targetJson)), state: row.state, expiresAt: row.expiresAt.toISOString() });
async function verifyDeclaredTarget(user: CausaAccessUser, target: SecretTarget, options: SecretUseOptions) {
  if (typeof options.verifyTarget !== "function") throw new SecretError("secret_adapter_required", "Esta versión del escritorio aún no permite usar secretos de forma segura.", 503);
  try { await options.verifyTarget(user, target); }
  catch { throw new SecretError("secret_target_unavailable", "No se pudo confirmar que el escritorio siga bajo su control. Compruebe el destino antes de continuar.", 409); }
}
export async function prepareSecretUse(user: CausaAccessUser, input: PrepareSecretUseInput, options: SecretUseOptions): Promise<SecretUseGrant> {
  const body = prepareSecretUseSchema.parse(input), target = normalizeSecretTarget(body.target), db = database(options);
  const access = await targetAccess(db, user, target, options);
  const hash = secretReceipt(access.actor.id, "prepare", { ...body, target }, options.material);
  await verifyDeclaredTarget(user, target, options);
  return altazorTransaction(db, async tx => {
    const current = await targetAccess(tx, user, target, options);
    const secret = await secretFor(tx, current.actor.id, body.secretId);
    if (secret.revision !== body.revision) throw changed();
    const receipt = await tx.altazorSecretReceipt.findUnique({ where: { ownerId_requestId: { ownerId: current.actor.id, requestId: body.requestId } } });
    if (receipt) {
      receiptMatches(receipt, "prepare", hash);
      const grant = await tx.altazorSecretGrant.findFirst({ where: { id: receipt.resourceId, ownerId: current.actor.id } });
      if (!grant || grant.expiresAt.getTime() <= clock(options) || grant.state !== "pending" || !constantEqual(grant.sessionHash, current.sessionHash)) throw new SecretError("secret_grant_expired", "La autorización ya no está disponible. Confirme una nueva solicitud.", 409);
      return grantView(grant);
    }
    const grant = await tx.altazorSecretGrant.create({ data: { id: randomUUID(), ownerId: current.actor.id, secretId: secret.id, secretRevision: secret.revision, sessionId: current.session.id, targetJson: JSON.stringify(target), targetHash: secretReceipt(current.actor.id, "target", target, options.material), sessionHash: current.sessionHash, expiresAt: new Date(Math.min(clock(options) + SECRET_LIMITS.grantMs, current.session.expiresAt?.getTime() ?? Infinity)) } });
    await tx.altazorSecretReceipt.create({ data: { ownerId: current.actor.id, requestId: body.requestId, kind: "prepare", inputHash: hash, resourceId: grant.id } });
    return grantView(grant);
  });
}

/**
 * One-use bridge to trusted Computer code, never an HTTP value reader.
 * The callback must send directly to its verified gateway; do not nest a service transaction
 * that locks this same session. Its return value and exception are deliberately discarded.
 */
export async function redeemSecretUse(user: CausaAccessUser, input: { grantId: string; target: SecretTarget; confirmed: true }, write: (value: string) => Promise<void>, options: SecretUseOptions): Promise<{ id: string; state: "used" | "unknown" }> {
  secretIdSchema.parse(input.grantId);
  if (input.confirmed !== true) throw new SecretError("secret_confirmation_required", "Confirme el uso del secreto en este destino.");
  const target = normalizeSecretTarget(input.target), db = database(options);
  const access = await targetAccess(db, user, target, options);
  const targetHash = secretReceipt(access.actor.id, "target", target, options.material);
  const found = await db.altazorSecretGrant.findFirst({ where: { id: input.grantId, ownerId: access.actor.id } });
  if (!found || !constantEqual(found.targetHash, targetHash) || found.sessionId !== target.sessionId) throw new SecretError("secret_grant_not_found", "Autorización no encontrada para este destino.", 404);
  if (found.state === "used" || found.state === "unknown" || found.state === "consuming") return { id: found.id, state: found.state === "used" ? "used" : "unknown" };
  if (found.state !== "pending" || found.expiresAt.getTime() <= clock(options) || !constantEqual(found.sessionHash, access.sessionHash)) throw new SecretError("secret_grant_expired", "La autorización venció o fue revocada. Confirme una nueva solicitud.", 409);
  await verifyDeclaredTarget(user, target, options);
  // This claim commits BEFORE any outbound side effect. Even an uncertain DB/network result
  // cannot make the callback eligible for retry.
  const claim = await db.altazorSecretGrant.updateMany({ where: { id: found.id, ownerId: access.actor.id, state: "pending", secretRevision: found.secretRevision, expiresAt: { gt: new Date(clock(options)) } }, data: { state: "consuming", consumedAt: new Date(clock(options)) } });
  if (!claim.count) return { id: found.id, state: "unknown" };
  let state: "used" | "unknown" = "unknown";
  try {
    // Never retry this transaction: it contains the only outbound invocation.
    await db.$transaction(async tx => {
      const live = await targetAccess(tx, user, target, options);
      if (!constantEqual(found.sessionHash, live.sessionHash)) throw changed();
      // Row locks serialize rotation/deletion, ACL revocation and session release with typing.
      const userLock = await tx.user.updateMany({ where: { id: live.actor.id, role: live.actor.role, capabilityGrants: live.actor.capabilityGrants, capabilityRevokes: live.actor.capabilityRevokes }, data: { capabilityRevokes: live.actor.capabilityRevokes } });
      const workspaceLock = await tx.altazorComputerWorkspace.updateMany({ where: { id: live.workspace.id, ownerId: live.actor.id, enabled: true, credentialEnc: live.workspace.credentialEnc }, data: { updatedAt: live.workspace.updatedAt } });
      const sessionLock = await tx.altazorComputerSession.updateMany({ where: { id: live.session.id, ownerId: live.actor.id, state: "ready", held: true, ...activeComputerSessionWhere(new Date(clock(options))), updatedAt: live.session.updatedAt }, data: { updatedAt: live.session.updatedAt } });
      const secretLock = await tx.altazorSecret.updateMany({ where: { id: found.secretId, ownerId: live.actor.id, revision: found.secretRevision }, data: { revision: found.secretRevision } });
      const grantLock = await tx.altazorSecretGrant.updateMany({ where: { id: found.id, ownerId: live.actor.id, state: "consuming", expiresAt: { gt: new Date(clock(options)) } }, data: { state: "consuming" } });
      if (![userLock, workspaceLock, sessionLock, secretLock, grantLock].every(result => result.count === 1)) throw changed();
      const row = await tx.altazorSecret.findFirst({ where: { id: found.secretId, ownerId: live.actor.id, revision: found.secretRevision } });
      if (!row) throw missing();
      const value = decryptSecret(row.ciphertext, row, options.material);
      await write(value);
    }, { isolationLevel: "ReadCommitted", timeout: 20_000 });
    state = "used";
  } catch { /* Callback/network errors may contain the value; never log or expose them. */ }
  try { await db.altazorSecretGrant.updateMany({ where: { id: found.id, ownerId: access.actor.id, state: "consuming" }, data: { state } }); }
  catch { state = "unknown"; } // A stuck consuming claim also remains permanently non-replayable.
  return { id: found.id, state };
}
export async function revokeSecretUse(user: CausaAccessUser, grantId: string, options: SecretOptions = {}) {
  secretIdSchema.parse(grantId);
  const db = database(options), actor = await altazorActor(user, db);
  const grant = await db.altazorSecretGrant.findFirst({ where: { id: grantId, ownerId: actor.id }, select: { id: true } });
  if (!grant) throw new SecretError("secret_grant_not_found", "Autorización no encontrada o sin acceso actual.", 404);
  await db.altazorSecretGrant.updateMany({ where: { id: grant.id, ownerId: actor.id, state: { in: ["pending", "consuming"] } }, data: { state: "revoked" } });
  return { revoked: true as const };
}
