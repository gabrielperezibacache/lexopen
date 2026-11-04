import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { sha256 } from "@/lib/evidence/fragments";
import { verifyAltazorShareOrigin } from "./share-origin";

const user = { id: "owner-fixture", role: "abogado", name: "Profesional ficticio", capabilityGrants: "", capabilityRevokes: "" };
const body = "Revisión académica ficticia conservada.", workspaceId = "workspace-fixture", artifactId = "artifact-fixture";
const origin = { kind: "academic", workspaceId, artifactId, revision: 3, bodySha256: sha256(body) };
function fixture(overrides: { status?: string; revision?: number; body?: string; bodySha256?: string; workspaceOwnerId?: string; allowed?: boolean } = {}) {
  const actor = overrides.allowed === false ? { ...user, capabilityRevokes: "assistant.use" } : user;
  const artifact = { id: artifactId, workspaceId, status: "reviewed", revision: 3, body, bodySha256: sha256(body), sourceSnapshotsJson: "[]", destinationJson: "{}", createdAt: new Date(0), errorCode: null, ...overrides };
  return {
    user: { findUnique: async () => actor },
    altazorAcademicWorkspace: { findFirst: async ({ where }: { where: { id: string; ownerId: string } }) => where.id === workspaceId && where.ownerId === (overrides.workspaceOwnerId || user.id) ? { id: workspaceId } : null },
    altazorAcademicArtifact: { findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) => where.id === artifactId && where.workspaceId === workspaceId ? artifact : null },
  } as unknown as PrismaClient;
}
const draft = (value: unknown = origin) => ({ ownerId: user.id, originJson: JSON.stringify(value) });
const status = (expected: number) => (error: unknown) => Number((error as { status?: number }).status) === expected;

test("share origins allow only owned manual drafts or a strict server academic reference", async () => {
  await verifyAltazorShareOrigin(draft({}), user, fixture());
  await verifyAltazorShareOrigin(draft(), user, fixture());
  await assert.rejects(verifyAltazorShareOrigin({ ...draft(), ownerId: "other-owner" }, user, fixture()), status(404));
  for (const value of [null, [], { kind: "manual" }, { ...origin, extra: true }, { ...origin, bodySha256: "forged" }]) await assert.rejects(verifyAltazorShareOrigin(draft(value), user, fixture()), status(409));
  await assert.rejects(verifyAltazorShareOrigin({ ownerId: user.id, originJson: "{" }, user, fixture()), status(409));
});
test("academic social drafts fail closed after revision, content, review or current permission changes", async () => {
  for (const change of [{ revision: 4 }, { status: "proposed" }, { body: "Texto cambiado", bodySha256: sha256("Texto cambiado") }, { bodySha256: "a".repeat(64) }]) await assert.rejects(verifyAltazorShareOrigin(draft(), user, fixture(change)), status(409));
  await assert.rejects(verifyAltazorShareOrigin(draft(), user, fixture({ workspaceOwnerId: "other-owner" })), status(404));
  await assert.rejects(verifyAltazorShareOrigin(draft(), user, fixture({ allowed: false })), status(403));
});
