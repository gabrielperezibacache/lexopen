import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { firmSettingsPatchSchema, updateFirmSettings } from "./firm-settings";

const forbidden = (error: unknown) => (error as { status?: number }).status === 403;

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const db = new PrismaClient({ datasources: { db: { url } } });
  const users: string[] = [];
  let organizationId: string | undefined;
  try {
    assert.equal(await db.organization.count(), 0, "requires a fresh organization scope");
    const tag = randomUUID();
    const admin = await db.user.create({ data: { name: "Host fixture", email: `${tag}-admin@settings.invalid`, role: "admin", password: "not-a-login" } });
    const delegate = await db.user.create({ data: { name: "Delegate fixture", email: `${tag}-delegate@settings.invalid`, role: "abogado", capabilityGrants: "host.admin", password: "not-a-login" } });
    const partner = await db.user.create({ data: { name: "Partner fixture", email: `${tag}-partner@settings.invalid`, role: "socio", password: "not-a-login" } });
    const client = await db.user.create({ data: { name: "Portal fixture", email: `${tag}-portal@settings.invalid`, role: "cliente", capabilityGrants: "host.admin", password: "not-a-login" } });
    users.push(admin.id, delegate.id, partner.id, client.id);
    for (const actor of [partner, client]) await assert.rejects(updateFirmSettings({ name: "Forbidden" }, actor, db), forbidden);
    assert.equal(await db.organization.count(), 0, "denied requests never create settings");

    const initial = await updateFirmSettings({
      name: "Shared firm", rut: "fixture-rut", email: "firm@settings.invalid", telefono: "555", direccion: "Fictitious address",
      emisorRazonSocial: "Issuer", emisorRut: "fixture-issuer", emisorGiro: "Legal", emisorDireccion: "Fictitious issuer address",
      defaultRetencionPct: 0.15, ivaPct: 0.19, hermesAllowDemo: true, assistantLlmMode: "local_only", auditLlmPrompts: true,
    }, admin, db);
    organizationId = initial.id;
    await db.firmSettings.update({ where: { organizationId }, data: { claveUnicaPasswordEnc: "fixture-ciphertext-not-a-credential", workCountry: "CL", require2faPrivileged: true } });
    const renamed = await updateFirmSettings({ name: "Renamed firm" }, delegate, db);
    assert.equal(renamed.name, "Renamed firm");
    assert.equal(renamed.rut, initial.rut);
    assert.equal(renamed.email, initial.email);
    assert.deepEqual(renamed.settings, initial.settings, "a partial identity patch preserves billing, demo and remote-AI policy");

    const toggled = await updateFirmSettings({ hermesAllowDemo: false, direccion: null }, delegate, db);
    assert.equal(toggled.settings?.hermesAllowDemo, false);
    assert.equal(toggled.settings?.auditLlmPrompts, true);
    assert.equal(toggled.settings?.assistantLlmMode, "local_only");
    assert.equal(toggled.direccion, null);
    assert.equal(toggled.telefono, "555");
    const full = await db.firmSettings.findUniqueOrThrow({ where: { organizationId } });
    assert.equal(full.claveUnicaPasswordEnc, "fixture-ciphertext-not-a-credential");
    assert.equal(full.workCountry, "CL");
    assert.equal(full.require2faPrivileged, true);
    assert.equal("claveUnicaPasswordEnc" in toggled.settings!, false, "responses never contain connector credentials");
    assert.equal((await db.auditEvent.findMany({ where: { action: "settings.firm", entityId: organizationId } })).length, 3);

    for (const input of [{}, { name: "" }, { name: "Unknown", capabilityGrants: "host.admin" }, { claveUnicaPasswordEnc: "forbidden" }, { assistantLlmMode: "invalid" }]) {
      assert.equal(firmSettingsPatchSchema.safeParse(input).success, false);
    }
    await db.user.update({ where: { id: delegate.id }, data: { capabilityRevokes: "host.admin" } });
    await assert.rejects(updateFirmSettings({ name: "Stale delegate" }, delegate, db), forbidden);
    await db.user.update({ where: { id: admin.id }, data: { capabilityRevokes: "host.admin" } });
    await assert.rejects(updateFirmSettings({ name: "Revoked admin" }, admin, db), forbidden);
    assert.equal((await db.organization.findUniqueOrThrow({ where: { id: organizationId } })).name, "Renamed firm");
    console.log("Firm settings passed: effective staff administration, fresh permission checks, portal isolation, partial update preservation, shared policy, safe responses and audit.");
  } finally {
    await db.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    if (organizationId) await db.organization.delete({ where: { id: organizationId } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
