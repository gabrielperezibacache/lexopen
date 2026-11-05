/** Only a newly created local disposable PG and synthetic callback; never real credentials. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { createSecret, deleteSecret, getSecret, listSecrets, prepareSecretUse, redeemSecretUse, rotateSecret } from "./service";
import type { SecretTarget } from "./policy";

const hasStatus = (status: number) => (error: unknown) => (error as { status?: number }).status === status;
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  process.env.ALTAZOR_COMPUTER_ENABLED = "1";
  const tag = randomUUID(), users: string[] = [], workspaces: string[] = [], sessions: string[] = [];
  const material = `synthetic-vault-fixture-${tag}`, value = `fictitious-password-${tag}`;
  const options = { client: prisma, material, verifyTarget: async () => {} };
  try {
    const owner = await prisma.user.create({ data: { name: "Vault fixture owner", email: `${tag}@vault.invalid`, role: "abogado", password: "not-a-real-login" } }); users.push(owner.id);
    const outsider = await prisma.user.create({ data: { name: "Vault fixture outsider", email: `${tag}-other@vault.invalid`, role: "abogado", password: "not-a-real-login" } }); users.push(outsider.id);
    const workspace = await prisma.altazorComputerWorkspace.create({ data: { ownerId: owner.id, scopeKey: "personal", endpoint: `http://127.0.0.1:18844/${tag}`, providerName: "synthetic-no-network", credentialEnc: "fictitious-cipher-not-a-gateway-token", enabled: true, dedicatedDeclaredAt: new Date() } }); workspaces.push(workspace.id);
    const session = await prisma.altazorComputerSession.create({ data: { ownerId: owner.id, workspaceId: workspace.id, requestId: `session-${tag}`, kittyName: `fixture-${tag}`, kittyId: `kitty-${tag}`, chatId: `chat-${tag}`, state: "ready", held: true, expiresAt: new Date(Date.now() + 300_000) } }); sessions.push(session.id);
    const target: SecretTarget = { sessionId: session.id, origin: "https://fictitious.example.invalid", field: "password", fieldLabel: "Contraseña declarada por persona" };
    const input = { requestId: `create-${tag}`, name: "Secreto ficticio", provider: "Portal ficticio de prueba", kind: "password" as const, value };
    const concurrentCreates = await Promise.all([createSecret(owner, input, options), createSecret(owner, input, options)]);
    const secret = concurrentCreates[0].secret;
    assert.equal(concurrentCreates[1].secret.id, secret.id);
    assert.equal(await prisma.altazorSecret.count({ where: { ownerId: owner.id } }), 1);
    assert.equal((await listSecrets(outsider, options)).length, 0);
    await assert.rejects(getSecret(outsider, secret.id, options), hasStatus(404));
    assert.equal("ciphertext" in await getSecret(owner, secret.id, options), false);
    const grant = await prepareSecretUse(owner, { requestId: `prepare-${tag}`, secretId: secret.id, revision: 1, target, confirmed: true }, options);
    let calls = 0;
    const write = async (received: string) => { calls++; assert.equal(received, value); await delay(20); };
    const simultaneous = await Promise.all([redeemSecretUse(owner, { grantId: grant.id, target, confirmed: true }, write, options), redeemSecretUse(owner, { grantId: grant.id, target, confirmed: true }, write, options)]);
    assert.equal(calls, 1); assert.ok(simultaneous.some(result => result.state === "used"));
    await redeemSecretUse(owner, { grantId: grant.id, target, confirmed: true }, write, options); assert.equal(calls, 1);
    // A callback holding the row locks and an overlapping rotation must serialize.
    const lockedGrant = await prepareSecretUse(owner, { requestId: `prepare-lock-${tag}`, secretId: secret.id, revision: 1, target, confirmed: true }, options);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const redemption = redeemSecretUse(owner, { grantId: lockedGrant.id, target, confirmed: true }, async received => { assert.equal(received, value); calls++; entered(); await gate; }, options);
    await started;
    let rotationSettled = false;
    const rotation = rotateSecret(owner, secret.id, { ...input, requestId: `rotate-${tag}`, revision: 1, value: "replacement-fictitious-password" }, options).then(result => { rotationSettled = true; return result; });
    try { await delay(50); assert.equal(rotationSettled, false); } finally { release(); }
    assert.equal((await redemption).state, "used"); assert.equal((await rotation).secret.revision, 2);
    // Separate CAS contenders cannot overwrite each other.
    const rotateInput = { ...input, revision: 2, value: "third-fictitious-password" };
    const contenders = await Promise.allSettled([rotateSecret(owner, secret.id, { ...rotateInput, requestId: `cas-a-${tag}` }, options), rotateSecret(owner, secret.id, { ...rotateInput, requestId: `cas-b-${tag}` }, options)]);
    assert.equal(contenders.filter(result => result.status === "fulfilled").length, 1);
    const current = await getSecret(owner, secret.id, options); assert.equal(current.revision, 3);
    const revokedGrant = await prepareSecretUse(owner, { requestId: `prepare-revoke-${tag}`, secretId: secret.id, revision: 3, target, confirmed: true }, options);
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "assistant.use" } });
    const beforeRevocation = calls;
    await assert.rejects(redeemSecretUse(owner, { grantId: revokedGrant.id, target, confirmed: true }, async () => { calls++; }, options), hasStatus(403)); assert.equal(calls, beforeRevocation);
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });
    const dump = await prisma.altazorSecret.findMany({ where: { ownerId: owner.id } });
    const receipts = await prisma.altazorSecretReceipt.findMany({ where: { ownerId: owner.id } });
    assert.equal(JSON.stringify({ dump, receipts }).includes(value), false);
    assert.equal(JSON.stringify({ dump, receipts }).includes("third-fictitious-password"), false);
    await deleteSecret(owner, secret.id, { requestId: `delete-${tag}`, revision: 3, confirmed: true }, options);
    assert.equal(await prisma.altazorSecret.count({ where: { ownerId: owner.id } }), 0);
    assert.equal(await prisma.altazorSecretGrant.count({ where: { ownerId: owner.id } }), 0);
    assert.equal(JSON.stringify(await prisma.altazorSecretReceipt.findMany({ where: { ownerId: owner.id } })).includes(value), false);
    console.log("ALTAZOR Secretos PG: private metadata, ciphertext purge, HMAC replay, live ACL, CAS and one-use concurrency passed (synthetic only).");
  } finally {
    await prisma.altazorSecretGrant.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorSecret.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorSecretReceipt.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorComputerSession.deleteMany({ where: { id: { in: sessions } } });
    await prisma.altazorComputerWorkspace.deleteMany({ where: { id: { in: workspaces } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
}
main().catch(() => { console.error("Falló la prueba sintética de Secretos; no se imprimen errores ni contenidos del vault."); process.exitCode = 1; });
