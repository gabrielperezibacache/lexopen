import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { decryptSecret, encryptSecret, secretReceipt, secretsConfigured } from "./crypto";
import { createSecretSchema, type SecretTarget } from "./policy";
import { readSecretBody, secretFailure } from "./http";
import { createSecret, deleteSecret, getSecret, listSecrets, prepareSecretUse, redeemSecretUse, revokeSecretUse, rotateSecret } from "./service";

const material = "synthetic-vault-key-5971d1e8c9bc4a858acf";
const value = "fictitious-password-!!-not-a-login";
const identity = { ownerId: "owner", id: "secret", revision: 1 };
const owner = { id: "owner", role: "abogado", capabilityGrants: "", capabilityRevokes: "" };
const outsider = { ...owner, id: "outsider" };
const input = { requestId: "create-fixture-001", name: "Credencial ficticia", provider: "Portal del estudio", username: "persona ficticia", kind: "password" as const, value };
const target: SecretTarget = { sessionId: "session", origin: "https://portal.example.invalid", field: "password", fieldLabel: "Contraseña declarada por persona" };
const hasCode = (code: string) => (error: unknown) => (error as { code?: string }).code === code;
const hasStatus = (status: number) => (error: unknown) => (error as { status?: number }).status === status;

// Test-only dynamic Prisma fixture, never a production persistence adapter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([field, value]) => {
    if (field === "ownerId_requestId") return matches(row, value);
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value && !value.in.includes(row[field])) return false;
      if ("gt" in value && !(row[field] > value.gt)) return false;
      return true;
    }
    return row[field] instanceof Date && value instanceof Date ? row[field].getTime() === value.getTime() : row[field] === value;
  });
}
function fixture() {
  let now = Date.parse("2026-11-05T00:00:00Z"), sequence = 0;
  const rows: Record<string, Row[]> = {
    user: [structuredClone(owner), structuredClone(outsider)], altazorSecret: [], altazorSecretReceipt: [], altazorSecretGrant: [],
    firmSettings: [{ assistantLlmMode: "remote_allowed" }],
    altazorComputerWorkspace: [{ id: "workspace", ownerId: owner.id, causaId: null, scopeKey: "personal", enabled: true, credentialEnc: "encrypted-gateway-fixture", endpoint: "http://127.0.0.1:19999", providerName: "synthetic", updatedAt: new Date(now) }],
    altazorComputerSession: [{ id: "session", ownerId: owner.id, workspaceId: "workspace", state: "ready", held: true, kittyId: "kitty-fixture", chatId: "chat-fixture", updatedAt: new Date(now), expiresAt: new Date(now + 300_000) }],
  };
  let afterClaim: (() => void) | undefined;
  function project(row: Row | undefined, select?: Row) { return !row ? null : structuredClone(select ? Object.fromEntries(Object.entries(select).filter(([, enabled]) => enabled).map(([key]) => [key, row[key]])) : row); }
  const client: Row = {};
  for (const table of Object.keys(rows)) client[table] = {
    findFirst: async ({ where, select }: Row = {}) => project(rows[table].find(row => matches(row, where)), select),
    findUnique: async ({ where, select }: Row) => project(rows[table].find(row => matches(row, where)), select),
    findMany: async ({ where, select, take }: Row) => rows[table].filter(row => matches(row, where)).slice(0, take).map(row => project(row, select)),
    count: async ({ where }: Row) => rows[table].filter(row => matches(row, where)).length,
    create: async ({ data, select }: Row) => { const row = { id: `fixture-${++sequence}`, revision: 1, state: "pending", createdAt: new Date(now), updatedAt: new Date(now), ...data }; rows[table].push(row); return project(row, select); },
    updateMany: async ({ where, data }: Row) => {
      let count = 0;
      for (const row of rows[table]) if (matches(row, where)) { count++; Object.assign(row, data); }
      if (table === "altazorSecretGrant" && data.state === "consuming" && data.consumedAt) afterClaim?.();
      return { count };
    },
    deleteMany: async ({ where }: Row) => {
      const removed = rows[table].filter(row => matches(row, where));
      rows[table] = rows[table].filter(row => !matches(row, where));
      if (table === "altazorSecret") rows.altazorSecretGrant = rows.altazorSecretGrant.filter(grant => !removed.some(secret => secret.id === grant.secretId));
      return { count: removed.length };
    },
  };
  client.$transaction = async (run: (tx: PrismaClient) => unknown) => {
    const before = structuredClone(rows);
    try { return await run(client as PrismaClient); }
    catch (error) { for (const [table, contents] of Object.entries(before)) rows[table] = contents; throw error; }
  };
  const options = { client: client as PrismaClient, material, now: () => now, verifyTarget: async () => {} };
  return { rows, options, advance: (ms: number) => { now += ms; }, afterClaim: (run: () => void) => { afterClaim = run; } };
}
async function grant(f: ReturnType<typeof fixture>, requestId = "prepare-fixture-001") {
  const saved = await createSecret(owner, input, f.options);
  return prepareSecretUse(owner, { requestId, secretId: saved.secret.id, revision: saved.secret.revision, target, confirmed: true }, f.options);
}

test("encryption binds owner, ID and revision; tamper and wrong key fail without exposing plaintext", () => {
  const cipher = encryptSecret(value, identity, material);
  assert.equal(cipher.includes(value), false); assert.equal(decryptSecret(cipher, identity, material), value);
  assert.notEqual(cipher, encryptSecret(value, identity, material));
  for (const changed of [{ ...identity, ownerId: "outsider" }, { ...identity, id: "other" }, { ...identity, revision: 2 }]) assert.throws(() => decryptSecret(cipher, changed, material), hasCode("secret_unreadable"));
  const parts = cipher.split("."); parts[1] = `${parts[1][0] === "a" ? "b" : "a"}${parts[1].slice(1)}`;
  assert.throws(() => decryptSecret(parts.join("."), identity, material), hasCode("secret_unreadable"));
  assert.throws(() => decryptSecret(cipher, identity, `${material}-other`), error => !String(error).includes(value));
  assert.throws(() => encryptSecret(value, identity, "weak"), hasCode("secrets_unconfigured"));
  assert.equal(secretsConfigured("weak"), false);
  assert.throws(() => decryptSecret(value, identity, material), error => !String(error).includes(value));
});
test("receipts use distinct purpose/owner keyed HMAC, not an unkeyed password digest", () => {
  const hash = secretReceipt(owner.id, "create", input, material);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, createHash("sha256").update(JSON.stringify(input)).digest("hex"));
  assert.notEqual(hash, secretReceipt(outsider.id, "create", input, material));
  assert.notEqual(hash, secretReceipt(owner.id, "rotate", input, material));
});
test("form accepts display providers, preserves whitespace secrets and bounds/forbids extra inputs", () => {
  assert.equal(createSecretSchema.parse({ ...input, value: "  fixture  " }).value, "  fixture  ");
  assert.equal(createSecretSchema.safeParse({ ...input, value: "a".repeat(2001) }).success, false);
  assert.equal(createSecretSchema.safeParse({ ...input, exportToChat: true }).success, false);
});
test("private metadata never contains cipher/value; every read and mutation rechecks owner and live capability", async () => {
  const f = fixture(), created = await createSecret(owner, input, f.options);
  assert.equal(JSON.stringify(created).includes(value), false);
  assert.equal("ciphertext" in created.secret, false); assert.equal("ownerId" in created.secret, false);
  assert.equal((await listSecrets(owner, f.options)).length, 1); assert.equal((await listSecrets(outsider, f.options)).length, 0);
  await assert.rejects(getSecret(outsider, created.secret.id, f.options), hasStatus(404));
  await assert.rejects(deleteSecret(outsider, created.secret.id, { requestId: "outsider-delete-01", revision: 1, confirmed: true }, f.options), hasStatus(404));
  f.rows.user[0].capabilityRevokes = "assistant.use";
  await assert.rejects(listSecrets(owner, f.options), hasStatus(403));
  await assert.rejects(createSecret(owner, input, f.options), hasStatus(403));
});
test("mutation receipts are idempotent and refuse changed input without retaining plaintext", async () => {
  const f = fixture(), first = await createSecret(owner, input, f.options), second = await createSecret(owner, input, f.options);
  assert.equal(second.secret.id, first.secret.id); assert.equal(second.replayed, true); assert.equal(f.rows.altazorSecret.length, 1);
  await assert.rejects(createSecret(owner, { ...input, value: "different-fictitious-password" }, f.options), hasCode("secret_request_reused"));
  assert.equal(JSON.stringify(f.rows.altazorSecretReceipt).includes(value), false);
  assert.equal(JSON.stringify(f.rows.altazorSecret).includes(value), false);
});
test("rotation uses compare-and-swap, replaces ciphertext and revokes outstanding grants", async () => {
  process.env.ALTAZOR_COMPUTER_ENABLED = "1";
  const f = fixture(), prepared = await grant(f), before = f.rows.altazorSecret[0].ciphertext;
  await assert.rejects(rotateSecret(owner, prepared.secretId, { ...input, requestId: "rotate-bad-revision", revision: 2 }, f.options), hasCode("secret_changed"));
  const rotated = await rotateSecret(owner, prepared.secretId, { ...input, requestId: "rotate-fixture-001", revision: 1, value: "new-fictitious-value" }, f.options);
  assert.equal(rotated.secret.revision, 2); assert.notEqual(f.rows.altazorSecret[0].ciphertext, before); assert.equal(f.rows.altazorSecretGrant[0].state, "revoked");
  let calls = 0; await assert.rejects(redeemSecretUse(owner, { grantId: prepared.id, target, confirmed: true }, async () => { calls++; }, f.options), hasCode("secret_grant_expired")); assert.equal(calls, 0);
});
test("delete physically purges cipher and grants; receipt replay cannot restore the deleted secret", async () => {
  const f = fixture(), prepared = await grant(f);
  const request = { requestId: "delete-fixture-001", revision: 1, confirmed: true as const };
  assert.equal((await deleteSecret(owner, prepared.secretId, request, f.options)).deleted, true);
  assert.equal(f.rows.altazorSecret.length, 0); assert.equal(f.rows.altazorSecretGrant.length, 0);
  assert.equal((await deleteSecret(owner, prepared.secretId, request, f.options)).replayed, true);
  await assert.rejects(createSecret(owner, input, f.options), hasStatus(404));
  assert.equal(JSON.stringify(f.rows.altazorSecretReceipt).includes(value), false);
});
test("one-use grants require same target, owner and active manual session; result never echoes callback", async () => {
  const f = fixture(), prepared = await grant(f);
  await assert.rejects(redeemSecretUse(owner, { grantId: prepared.id, target: { ...target, origin: "https://other.example.invalid" }, confirmed: true }, async () => {}, f.options), hasStatus(404));
  await assert.rejects(redeemSecretUse(outsider, { grantId: prepared.id, target, confirmed: true }, async () => {}, f.options), hasStatus(404));
  let calls = 0;
  const use = async (received: string) => { calls++; assert.equal(received, value); return { value } as unknown as void; };
  const first = await redeemSecretUse(owner, { grantId: prepared.id, target, confirmed: true }, use, f.options);
  const replay = await redeemSecretUse(owner, { grantId: prepared.id, target, confirmed: true }, use, f.options);
  assert.equal(first.state, "used"); assert.deepEqual(replay, first); assert.equal(calls, 1); assert.equal(JSON.stringify(first).includes(value), false);
});
test("uncertain callback response is permanently non-replayable and sanitizes value-bearing exceptions", async () => {
  const f = fixture(), prepared = await grant(f); let calls = 0;
  const use = async () => { calls++; throw new Error(`network failure containing ${value}`); };
  const first = await redeemSecretUse(owner, { grantId: prepared.id, target, confirmed: true }, use, f.options);
  assert.equal(first.state, "unknown"); assert.equal(JSON.stringify(first).includes(value), false);
  assert.deepEqual(await redeemSecretUse(owner, { grantId: prepared.id, target, confirmed: true }, use, f.options), first); assert.equal(calls, 1);
  assert.equal(JSON.stringify(f.rows.altazorSecretGrant).includes(value), false);
});
test("expiry, grant revocation and session rebinding prevent consumption", async () => {
  for (const condition of ["expiry", "revoke", "rebind", "focus", "hold", "capability"] as const) {
    const f = fixture(), prepared = await grant(f); let calls = 0;
    if (condition === "expiry") f.advance(60_001);
    if (condition === "revoke") await revokeSecretUse(owner, prepared.id, f.options);
    if (condition === "rebind") f.rows.altazorComputerSession[0].kittyId = "different-desktop";
    if (condition === "focus") f.rows.altazorComputerSession[0].updatedAt = new Date(f.rows.altazorComputerSession[0].updatedAt.getTime() + 1);
    if (condition === "hold") f.rows.altazorComputerSession[0].held = false;
    if (condition === "capability") f.rows.user[0].capabilityRevokes = "assistant.use";
    await assert.rejects(redeemSecretUse(owner, { grantId: prepared.id, target, confirmed: true }, async () => { calls++; }, f.options)); assert.equal(calls, 0);
  }
});
test("loss of hold after claim cannot type, and the committed claim cannot be replayed", async () => {
  const f = fixture(), prepared = await grant(f); let calls = 0;
  f.afterClaim(() => { f.rows.altazorComputerSession[0].held = false; });
  const result = await redeemSecretUse(owner, { grantId: prepared.id, target, confirmed: true }, async () => { calls++; }, f.options);
  assert.equal(result.state, "unknown"); assert.equal(calls, 0);
  f.rows.altazorComputerSession[0].held = true;
  await redeemSecretUse(owner, { grantId: prepared.id, target, confirmed: true }, async () => { calls++; }, f.options); assert.equal(calls, 0);
});
test("manual target is HTTPS origin only, and an absent or failing adapter cannot issue a grant", async () => {
  const f = fixture(), saved = await createSecret(owner, input, f.options);
  for (const origin of ["https://u:password@example.invalid", "https://example.invalid/path", "https://example.invalid?token=secret", "http://example.invalid", "https://example.invalid/#private"]) await assert.rejects(prepareSecretUse(owner, { requestId: "bad-origin-fixture", secretId: saved.secret.id, revision: 1, target: { ...target, origin }, confirmed: true }, f.options));
  await assert.rejects(prepareSecretUse(owner, { requestId: "absent-adapter-001", secretId: saved.secret.id, revision: 1, target, confirmed: true }, { ...f.options, verifyTarget: undefined as never }), hasCode("secret_adapter_required"));
  assert.equal(f.rows.altazorSecretGrant.length, 0);
});
test("HTTP errors never echo arbitrary, Zod or status-bearing secret values", async () => {
  const errors = [new Error(value), Object.assign(new Error(value), { status: 400 }), createSecretSchema.safeParse({ ...input, kind: value }).error];
  for (const error of errors) { const response = secretFailure(error); assert.equal((await response.text()).includes(value), false); assert.equal(response.headers.get("cache-control"), "private, no-store"); }
  const response = secretFailure(new z.ZodError([{ code: "custom", path: [value], message: value }])); assert.equal((await response.text()).includes(value), false);
  await assert.rejects(readSecretBody(new Request("https://example.invalid", { method: "POST", body: value }), createSecretSchema), hasCode("secret_json_required"));
});
