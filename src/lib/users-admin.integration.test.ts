import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { FOUNDER_ADMIN_GRANTS } from "./auth/permissions";
import { isAdmin } from "./auth/rbac";
import { assertDisposableDatabaseUrl } from "./testing/disposable-db";
import { createStudioUser, deleteStudioUser, updateStudioUser } from "./users-admin";

assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) throw new Error("DATABASE_URL must equal E2E_DATABASE_URL");
const fixture = randomUUID();
const ids: string[] = [];
async function user(role: string, overrides: { capabilityGrants?: string; capabilityRevokes?: string } = {}) {
  const row = await prisma.user.create({ data: { role, ...overrides, name: fixture, email: `${randomUUID()}@users-fixture.invalid`, password: "unused-fixture" } });
  ids.push(row.id);
  return row;
}
async function main() {
  // A separate unseeded disposable database is required to test the last administrator.
  assert.equal(await prisma.user.count(), 0, "Use a dedicated empty test/e2e database for the administrator invariant");
  try {
    const founder = await user("admin", { capabilityGrants: FOUNDER_ADMIN_GRANTS.join(",") });
    const revoked = await user("admin", { capabilityRevokes: "host.admin" });
    const portal = await user("cliente", { capabilityGrants: "host.admin" });
    const member = await user("abogado");
    await assert.rejects(updateStudioUser({ actorId: revoked.id, userId: member.id, title: "Forbidden" }), /administrar el Host/);
    await assert.rejects(updateStudioUser({ actorId: portal.id, userId: member.id, title: "Forbidden" }), /administrar el Host/);
    await assert.rejects(updateStudioUser({ actorId: member.id, userId: member.id, capabilityGrants: "host.admin" }), /administrar el Host/);
    await assert.rejects(updateStudioUser({ actorId: founder.id, userId: founder.id, capabilityRevokes: "host.admin" }), /al menos un usuario interno/);
    await assert.rejects(deleteStudioUser({ actorId: founder.id, userId: founder.id }), /propio usuario/);

    const created = await createStudioUser({ actorId: founder.id, name: fixture, email: `${randomUUID()}@users-fixture.invalid`, password: "fixture-password-12", role: "admin" });
    ids.push(created.id);
    const technical = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(technical.capabilityGrants, "", "A new technical administrator does not inherit founder's legal privileges");
    assert.equal(technical.capabilityRevokes, "");
    await assert.rejects(updateStudioUser({ actorId: technical.id, userId: technical.id, capabilityGrants: "escrito.approve" }), /ampliar sus propios permisos/);
    await assert.rejects(updateStudioUser({ actorId: technical.id, userId: member.id, capabilityGrants: "unknown.permission" }), /capacidades desconocidas/);

    await updateStudioUser({ actorId: technical.id, userId: founder.id, title: "Profile only", capabilityGrants: founder.capabilityGrants, capabilityRevokes: founder.capabilityRevokes });
    const preserved = await prisma.user.findUniqueOrThrow({ where: { id: founder.id } });
    assert.equal(preserved.capabilityGrants, founder.capabilityGrants);
    assert.equal(preserved.sessionVersion, founder.sessionVersion, "Unchanged permissions do not invalidate a profile-only update");
    await updateStudioUser({ actorId: technical.id, userId: member.id, capabilityGrants: "host.admin" });
    const delegated = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
    assert.equal(isAdmin(delegated), true);
    assert.equal(delegated.sessionVersion, member.sessionVersion + 1);
    await updateStudioUser({ actorId: member.id, userId: revoked.id, title: "Delegated management" });
    await updateStudioUser({ actorId: founder.id, userId: member.id, capabilityGrants: "" });
    await updateStudioUser({ actorId: founder.id, userId: founder.id, capabilityRevokes: "host.admin" });
    assert.equal(isAdmin(await prisma.user.findUniqueOrThrow({ where: { id: founder.id } })), false);
    await assert.rejects(updateStudioUser({ actorId: technical.id, userId: technical.id, capabilityRevokes: "host.admin" }), /al menos un usuario interno/);

    await updateStudioUser({ actorId: technical.id, userId: founder.id, capabilityRevokes: "" });
    const attempts = await Promise.allSettled([
      updateStudioUser({ actorId: founder.id, userId: founder.id, capabilityRevokes: "host.admin" }),
      updateStudioUser({ actorId: technical.id, userId: technical.id, capabilityRevokes: "host.admin" }),
    ]);
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1, "Concurrent revocations cannot remove every effective Host administrator");
    const managers = (await prisma.user.findMany()).filter(isAdmin);
    assert.equal(managers.length, 1);
    const survivor = managers[0];
    const version = survivor.sessionVersion;
    await updateStudioUser({ actorId: survivor.id, userId: survivor.id, email: `${randomUUID()}@users-fixture.invalid` });
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: survivor.id } })).sessionVersion, version + 1);
    const audits = await prisma.auditEvent.findMany({ where: { actorId: { in: ids } } });
    assert.equal(audits.some(event => event.action === "user.create"), true);
    console.log("users-admin.integration: effective admin, founder preservation, delegated management, self escalation, sessions and concurrent last-admin protection OK");
  } finally {
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
