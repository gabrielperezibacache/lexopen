import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { getCaseManagementMode } from "@/lib/causas/management-mode";
import { isWorkCountry, showCommunications, workCountryOptions, type WorkCountry } from "./countries";
import { getWorkCountry, updateWorkCountry } from "./work-country";

const statusIs = (status: number) => (error: unknown) => (error as { status?: number }).status === status;

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const db = new PrismaClient({ datasources: { db: { url } } });
  const users: string[] = [];
  let organizationId: string | undefined;
  try {
    const countries = workCountryOptions("es");
    assert.equal(new Set(countries.map(({ code }) => code)).size, 249);
    assert.equal(countries.find(({ code }) => code === "DE")?.label, "Alemania");
    assert.ok(isWorkCountry("CL") && !isWorkCountry("XX") && !isWorkCountry("EU") && !isWorkCountry("cl"));
    assert.equal(showCommunications(null, "manual"), false);
    assert.equal(showCommunications("AR", "manual"), false);
    assert.equal(showCommunications("CL", "manual"), true);
    assert.equal(showCommunications(null, "pjud_cl"), true);
    assert.equal(showCommunications("AR", "pjud_cl"), true);

    assert.equal(await db.organization.count(), 0, "requires fresh organization scope");
    assert.equal(await getWorkCountry(db), null);
    const tag = randomUUID();
    const admin = await db.user.create({ data: { name: "Admin fixture", email: `${tag}-admin@country.invalid`, role: "admin", password: "not-a-login" } });
    users.push(admin.id);
    const staff = await db.user.create({ data: { name: "Staff fixture", email: `${tag}-staff@country.invalid`, role: "socio", password: "not-a-login" } });
    users.push(staff.id);
    await assert.rejects(updateWorkCountry("CL", staff, db), statusIs(403));
    await assert.rejects(updateWorkCountry("ZZ" as WorkCountry, admin, db), statusIs(400));
    assert.equal(await db.organization.count(), 0);

    const replies = await Promise.all([updateWorkCountry("CL", admin, db), updateWorkCountry("CL", admin, db)]);
    assert.deepEqual(replies, [{ country: "CL" }, { country: "CL" }]);
    assert.equal(await db.organization.count(), 1);
    assert.equal(await getWorkCountry(db), "CL");
    assert.equal(await getCaseManagementMode(db), "manual");
    const auditWhere = { actorId: admin.id, action: "settings.work-country" };
    assert.equal(await db.auditEvent.count({ where: auditWhere }), 1);

    organizationId = (await db.organization.findFirstOrThrow({ select: { id: true } })).id;
    await db.user.update({ where: { id: staff.id }, data: { capabilityGrants: "host.admin" } });
    assert.deepEqual(await updateWorkCountry("PE", staff, db), { country: "PE" }, "delegated Host administrators manage shared settings");
    await db.user.update({ where: { id: staff.id }, data: { capabilityRevokes: "host.admin" } });
    await assert.rejects(updateWorkCountry("CL", staff, db), statusIs(403));
    const portal = await db.user.create({ data: { name: "Portal fixture", email: `${tag}-portal@country.invalid`, role: "cliente", capabilityGrants: "host.admin", password: "not-a-login" } });
    users.push(portal.id);
    await assert.rejects(updateWorkCountry("CL", portal, db), statusIs(403));
    await db.firmSettings.update({
      where: { organizationId },
      data: { caseManagementMode: "pjud_cl", claveUnicaEnabled: true, claveUnicaPasswordEnc: "fictitious-kept-value" },
    });
    assert.deepEqual(await updateWorkCountry("AR", admin, db), { country: "AR" });
    assert.equal(await getCaseManagementMode(db), "pjud_cl");
    assert.deepEqual(await updateWorkCountry(null, admin, db), { country: null });
    assert.equal(await getWorkCountry(db), null);
    const settings = await db.firmSettings.findUniqueOrThrow({ where: { organizationId } });
    assert.equal(settings.claveUnicaEnabled, true);
    assert.equal(settings.claveUnicaPasswordEnc, "fictitious-kept-value");
    assert.equal(await db.auditEvent.count({ where: auditWhere }), 3);

    await db.user.update({ where: { id: admin.id }, data: { capabilityRevokes: "host.admin" } });
    await assert.rejects(updateWorkCountry("CL", admin, db), statusIs(403));
    console.log("Work country passed: safe default, ISO catalog, Chile/PJUD visibility, delegated staff administration, revocation, portal isolation, concurrent updates, audit and PJUD settings preservation.");
  } finally {
    await db.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    if (organizationId) await db.organization.delete({ where: { id: organizationId } });
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
