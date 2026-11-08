import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { HOST_NAVIGATION_SECTIONS } from "@/lib/navigation/host-sections";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { getHostNavigationSections, initializeHostNavigationSections, updateHostNavigationSections, visibleSectionsSchema } from "./host-navigation-sections";

const statusIs = (status: number) => (error: unknown) => (error as { status?: number }).status === status;

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const db = new PrismaClient({ datasources: { db: { url } } });
  const users: string[] = [];
  let organizationId: string | undefined;
  try {
    assert.equal(await db.organization.count(), 0, "requires a fresh Host scope");
    assert.deepEqual(await getHostNavigationSections(db), [...HOST_NAVIGATION_SECTIONS]);
    assert.equal(visibleSectionsSchema.safeParse(["jornada"]).success, false);
    assert.equal(visibleSectionsSchema.safeParse(["configuration"]).success, false);

    const tag = randomUUID();
    const organization = await db.organization.create({ data: { settings: { create: { workCountry: "CL", caseManagementMode: "pjud_cl" } } } });
    organizationId = organization.id;
    assert.deepEqual(await getHostNavigationSections(db), [...HOST_NAVIGATION_SECTIONS], "a migrated existing Host keeps the default");
    const rollback = new Error("fixture rollback");
    await assert.rejects(db.$transaction(async tx => {
      await initializeHostNavigationSections(["agenda"], tx);
      throw rollback;
    }), rollback);
    assert.deepEqual(await getHostNavigationSections(db), [...HOST_NAVIGATION_SECTIONS]);

    const admin = await db.$transaction(async tx => {
      const created = await tx.user.create({ data: { name: "Admin fixture", email: `${tag}-admin@sections.invalid`, role: "admin", password: "not-a-login" } });
      await initializeHostNavigationSections(["biblioteca", "causas"], tx);
      return created;
    });
    users.push(admin.id);
    const delegate = await db.user.create({ data: { name: "Delegate fixture", email: `${tag}-delegate@sections.invalid`, role: "socio", capabilityGrants: "host.admin", password: "not-a-login" } });
    users.push(delegate.id);
    assert.deepEqual(await getHostNavigationSections(db), ["causas", "biblioteca"]);
    await assert.rejects(updateHostNavigationSections([], delegate, db), statusIs(403));

    const replies = await Promise.all([updateHostNavigationSections([], admin, db), updateHostNavigationSections([], admin, db)]);
    assert.deepEqual(replies, [{ visibleSections: [] }, { visibleSections: [] }]);
    assert.deepEqual(await getHostNavigationSections(db), []);
    const auditWhere = { actorId: admin.id, action: "settings.visible-sections" };
    assert.equal(await db.auditEvent.count({ where: auditWhere }), 1);
    assert.deepEqual(await updateHostNavigationSections([...HOST_NAVIGATION_SECTIONS], admin, db), { visibleSections: [...HOST_NAVIGATION_SECTIONS] });
    const settings = await db.firmSettings.findUniqueOrThrow({ where: { organizationId } });
    assert.equal(settings.workCountry, "CL");
    assert.equal(settings.caseManagementMode, "pjud_cl");
    assert.equal(await db.auditEvent.count({ where: auditWhere }), 2);

    await db.user.update({ where: { id: admin.id }, data: { capabilityRevokes: "host.admin" } });
    await assert.rejects(updateHostNavigationSections([], admin, db), statusIs(403));
    assert.deepEqual(await getHostNavigationSections(db), [...HOST_NAVIGATION_SECTIONS]);
    console.log("Host navigation passed: legacy default, transactional setup, current Host permission, concurrent save, audit and settings preservation.");
  } finally {
    await db.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    if (organizationId) await db.organization.delete({ where: { id: organizationId } });
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
