import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
test.afterAll(() => db.$disconnect());

async function fixture(page: Page) {
  const tag = randomUUID();
  const owner = await db.user.create({ data: { name: `Autor ${tag}`, email: `${tag}@minute-ui.invalid`, password: await hash("lexopen", 10), role: "abogado" } });
  const cause = await db.causa.create({ data: { titulo: `Causa ${tag}`, tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } });
  const site = await db.site.create({ data: { name: `Espacio ${tag}`, slug: tag, causaId: cause.id } });
  const workflow = await db.workflow.create({ data: { name: "Seguimiento completado", siteId: site.id, triggerType: "task_done", active: true, stepsJson: "[]" } });
  await loginAs(page, owner.email);
  await page.goto(`/causas/${cause.id}/minuta/nueva?tipo=reunion`);
  await page.getByLabel("Título", { exact: true }).fill(`Minuta ${tag}`);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel(/Resumen ejecutivo/).fill("Resumen ficticio de la reunión.");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Acción", { exact: true }).fill("Revisar antecedentes");
  await page.getByLabel("Responsable", { exact: true }).fill(owner.name);
  await page.getByLabel("Fecha límite", { exact: true }).fill("2026-11-24");
  await page.getByRole("checkbox", { name: "Crear plazo", exact: true }).check();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  return { owner, cause, workflow, cleanup: async () => {
    await db.workflowInstance.deleteMany({ where: { workflowId: workflow.id } });
    await db.workflow.deleteMany({ where: { siteId: site.id } });
    await db.task.deleteMany({ where: { creatorId: owner.id } });
    await db.site.delete({ where: { id: site.id } });
    await db.causa.delete({ where: { id: cause.id } });
    await db.mensajeSaliente.deleteMany({ where: { userId: owner.id } });
    await db.notification.deleteMany({ where: { userId: owner.id } });
    await db.commandExecution.deleteMany({ where: { ownerId: owner.id } });
    await db.auditEvent.deleteMany({ where: { actorId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  } };
}

for (const mode of ["respuesta perdida", "confirmación incompleta"] as const) {
  test(`minuta nativa: ${mode}, reintento sin duplicados y seguimiento coherente`, async ({ page }, info) => {
    const f = await fixture(page);
    const keys: (string | null)[] = [], bodies: (string | null)[] = [];
    let id = "";
    try {
      await page.route("**/api/minutas", async route => {
        if (route.request().method() !== "POST") return route.continue();
        keys.push(route.request().headers()["idempotency-key"] || null);
        bodies.push(route.request().postData());
        if (keys.length > 1) return route.continue();
        const response = await route.fetch();
        expect(response.status(), await response.text()).toBe(201);
        id = (await response.json()).minuta.id;
        if (mode === "respuesta perdida") await route.abort("failed");
        else await route.fulfill({ response, json: {} });
      });
      await page.getByRole("button", { name: "Guardar minuta", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: /Reintente el guardado/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Atrás", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "1. Contexto", exact: true })).toBeDisabled();
      await expect(page.getByRole("checkbox", { name: "Marcar confidencial", exact: true })).toBeDisabled();
      if (mode === "respuesta perdida") {
        for (const [label, viewport] of [["desktop", { width: 1366, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
          await page.setViewportSize(viewport);
          await page.getByRole("button", { name: "Reintentar guardado", exact: true }).scrollIntoViewIfNeeded();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
          await page.screenshot({ path: info.outputPath(`minuta-reintento-${label}.png`) });
        }
      }
      await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
      await page.waitForURL(`**/minutas/${id}`);
      expect(keys).toHaveLength(2);
      expect(keys[0]).toMatch(/^[a-f0-9-]{36}$/);
      expect(keys[1]).toBe(keys[0]);
      expect(bodies[1]).toBe(bodies[0]);
      expect(await db.minuta.count({ where: { causaId: f.cause.id } })).toBe(1);
      expect(await db.task.count({ where: { causaId: f.cause.id } })).toBe(1);
      expect(await db.plazo.count({ where: { causaId: f.cause.id } })).toBe(1);
      await page.getByRole("button", { name: "Hecha", exact: true }).click();
      await expect.poll(() => db.task.count({ where: { causaId: f.cause.id, status: "done" } })).toBe(1);
      await expect.poll(() => db.workflowInstance.count({ where: { workflowId: f.workflow.id } })).toBe(1);
      const minute = await db.minuta.findUniqueOrThrow({ where: { id }, include: { documento: true } });
      expect(minute.documento?.contenido).toContain("estado Hecha");
      expect(await db.plazo.count({ where: { causaId: f.cause.id, estado: "cumplido" } })).toBe(1);
      await expect(page.getByRole("button", { name: "Reabrir", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Reabrir", exact: true }).click();
      await expect.poll(() => db.task.count({ where: { causaId: f.cause.id, status: "todo" } })).toBe(1);
      expect(await db.workflowInstance.count({ where: { workflowId: f.workflow.id } })).toBe(1);
    } finally { await f.cleanup(); }
  });
}

test("minuta nativa: un rechazo de validación permite corregir los datos", async ({ page }) => {
  const f = await fixture(page);
  const keys: string[] = [];
  try {
    await page.route("**/api/minutas", async route => {
      if (route.request().method() !== "POST") return route.continue();
      keys.push(route.request().headers()["idempotency-key"]);
      if (keys.length === 1) return route.fulfill({ status: 400, json: { error: "Revise el título de la minuta." } });
      return route.continue();
    });
    await page.getByRole("button", { name: "Guardar minuta", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Revise el título" })).toBeVisible();
    await page.getByRole("button", { name: "1. Contexto", exact: true }).click();
    await page.getByLabel("Título", { exact: true }).fill("Título corregido");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("button", { name: "Guardar minuta", exact: true }).click();
    await page.waitForURL(/\/minutas\/[a-z0-9]+$/);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(await db.minuta.count({ where: { causaId: f.cause.id, titulo: "Título corregido" } })).toBe(1);
  } finally { await f.cleanup(); }
});
