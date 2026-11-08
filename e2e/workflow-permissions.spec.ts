import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { CSRF_COOKIE, CSRF_HEADER } from "../src/lib/auth/csrf-constants";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const tag = randomUUID();
const emails = { admin: `workflow-admin-${tag}@example.test`, abogado: `workflow-lawyer-${tag}@example.test`, socio: `workflow-partner-${tag}@example.test` };
const actorIds: string[] = [];
let siteId: string | undefined;

test.beforeAll(async () => {
  const { password } = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" }, select: { password: true } });
  for (const role of ["admin", "abogado", "socio"] as const) {
    const user = await db.user.create({ data: { email: emails[role], name: `Workflow ${role}`, role, password, capabilityGrants: "", capabilityRevokes: "" } });
    actorIds.push(user.id);
  }
  siteId = (await db.site.create({ data: { name: `Workflow permissions ${tag}`, slug: `workflow-permissions-${tag}`, tipo: "project" } })).id;
});

test.afterAll(async () => {
  try {
    await db.auditEvent.deleteMany({ where: { actorId: { in: actorIds } } });
    if (siteId) await db.site.delete({ where: { id: siteId } });
    await db.commandExecution.deleteMany({ where: { ownerId: { in: actorIds } } });
    await db.user.deleteMany({ where: { id: { in: actorIds } } });
  } finally { await db.$disconnect(); }
});

async function post(page: Page, data: object, key = randomUUID()) {
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === CSRF_COOKIE)?.value;
  expect(csrf).toBeTruthy();
  return page.request.post("/api/workflows", { data, headers: { [CSRF_HEADER]: csrf!, origin: new URL(page.url()).origin, "Idempotency-Key": key } });
}

test("los pasos jurídicos respetan su rol y el administrador conserva pasos explícitos o sin rol", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const lawyerContext = await browser.newContext({ locale: "es-CL" });
  const partnerContext = await browser.newContext({ locale: "es-CL" });
  const lawyer = await lawyerContext.newPage(), partner = await partnerContext.newPage();
  try {
    await loginAs(page, emails.admin);
    await loginAs(lawyer, emails.abogado);
    await loginAs(partner, emails.socio);
    const created = await post(page, { action: "create", name: "Aprobación profesional", siteId });
    expect(created.status(), await created.text()).toBe(201);
    const workflow = await created.json() as { id: string; stepsJson: string };
    expect(JSON.parse(workflow.stepsJson)).toEqual([
      { name: "Revisión abogado", role: "abogado" },
      { name: "Aprobación socio", role: "socio" },
    ]);
    const started = await post(page, { action: "start", workflowId: workflow.id });
    expect(started.status(), await started.text()).toBe(201);
    const instance = await started.json() as { id: string };
    const advance = { action: "advance", instanceId: instance.id, expectedStep: 0, decision: "approve" };

    expect((await post(page, advance)).status()).toBe(403);
    expect((await post(partner, advance)).status()).toBe(403);
    expect((await db.workflowInstance.findUniqueOrThrow({ where: { id: instance.id } })).currentStep).toBe(0);
    const reviewKey = randomUUID(), reviewed = await post(lawyer, advance, reviewKey);
    expect(reviewed.status(), await reviewed.text()).toBe(200);
    expect((await reviewed.json()).currentStep).toBe(1);
    const replayedReview = await post(lawyer, advance, reviewKey);
    expect(replayedReview.status(), await replayedReview.text()).toBe(200);
    expect((await replayedReview.json()).currentStep).toBe(1);
    const approve = { ...advance, expectedStep: 1 };
    expect((await post(page, approve)).status()).toBe(403);
    expect((await post(lawyer, approve)).status()).toBe(403);
    const approved = await post(partner, approve);
    expect(approved.status(), await approved.text()).toBe(200);
    expect((await approved.json()).status).toBe("approved");

    for (const steps of [[{ name: "Paso administrativo", role: "admin" }], [{ name: "Paso compartido" }]]) {
      const response = await post(page, { action: "create", name: steps[0].name, siteId, steps });
      expect(response.status(), await response.text()).toBe(201);
      const custom = await response.json() as { id: string };
      const start = await post(page, { action: "start", workflowId: custom.id });
      expect(start.status(), await start.text()).toBe(201);
      const active = await start.json() as { id: string };
      const decision = { action: "advance", instanceId: active.id, expectedStep: 0, decision: "approve" };
      if ("role" in steps[0]) expect((await post(lawyer, decision)).status()).toBe(403);
      const completed = await post(page, decision);
      expect(completed.status(), await completed.text()).toBe(200);
      expect((await completed.json()).status).toBe("approved");
    }
  } finally { await lawyerContext.close(); await partnerContext.close(); }
});
