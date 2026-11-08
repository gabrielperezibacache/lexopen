import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { authenticateApiRequests, loginAs, apiRequest } from "./helpers";

test.use({ timezoneId: "Asia/Tokyo" });
const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
test.afterAll(() => db.$disconnect());

async function fixture(page: Page) {
  const tag = randomUUID();
  const user = await db.user.create({ data: { name: "Equipo ficticio", email: `${tag}@tasks-ui.invalid`, role: "abogado", password: await hash("lexopen", 10) } });
  const cause = await db.causa.create({ data: { titulo: tag, tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: user.id } });
  const site = await db.site.create({ data: { name: tag, slug: tag, causaId: cause.id, members: { create: { userId: user.id } } } });
  await loginAs(page, user.email); await authenticateApiRequests(page);
  return { user, cause, site, title: `Tarea ${tag}`, cleanup: async () => {
    await db.task.deleteMany({ where: { creatorId: user.id } });
    await db.site.delete({ where: { id: site.id } });
    await db.causa.delete({ where: { id: cause.id } });
    await db.auditEvent.deleteMany({ where: { actorId: user.id } });
    await db.commandExecution.deleteMany({ where: { ownerId: user.id } });
    await db.notification.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  } };
}

test("tareas: creación y finalización con respuesta perdida sin duplicar efectos", async ({ page }, info) => {
  const f = await fixture(page), keys: string[] = [], bodies: string[] = [];
  try {
    await page.goto("/tareas");
    await page.getByRole("button", { name: "Nueva tarea", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nueva tarea", exact: true });
    await dialog.getByLabel("Título", { exact: true }).fill(f.title);
    await dialog.getByRole("combobox", { name: /^Causa\b/ }).selectOption(f.cause.id);
    await dialog.getByRole("combobox", { name: /^Espacio\b/ }).selectOption(f.site.id);
    await dialog.getByLabel("Fecha límite", { exact: true }).fill("2030-02-28");
    await dialog.getByLabel("Cómo hacerlo", { exact: true }).fill("Contrastar los documentos originales");
    await page.route("**/api/tasks", async route => {
      if (route.request().method() !== "POST") return route.continue();
      keys.push(route.request().headers()["idempotency-key"]); bodies.push(route.request().postData()!);
      const response = await route.fetch(); expect(response.status()).toBe(201);
      if (keys.length === 1) return route.abort("failed");
      return route.fulfill({ response });
    });
    await dialog.getByRole("button", { name: "Crear tarea", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("No se pudo confirmar la tarea");
    await expect(dialog.getByLabel("Título", { exact: true })).toBeDisabled();
    for (const [label, viewport] of [["desktop", { width: 1366, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
      await page.setViewportSize(viewport);
      await dialog.getByRole("button", { name: "Reintentar guardado" }).scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`tarea-reintento-${label}.png`) });
    }
    await dialog.getByRole("button", { name: "Reintentar guardado" }).click();
    await expect(dialog).not.toBeVisible();
    expect(keys).toHaveLength(2); expect(keys[0]).toBeTruthy(); expect(keys[1]).toBe(keys[0]); expect(bodies[1]).toBe(bodies[0]);
    expect(await db.task.count({ where: { title: f.title } })).toBe(1);
    const task = await db.task.findFirstOrThrow({ where: { title: f.title } });
    expect(task.dueDate?.toISOString()).toBe("2030-02-28T00:00:00.000Z");
    await db.task.update({ where: { id: task.id }, data: { rrule: "FREQ=WEEKLY" } });
    const workflow = await db.workflow.create({ data: { siteId: f.site.id, name: "Completar tarea", triggerType: "task_done", stepsJson: JSON.stringify([{ name: "Revisión", role: "abogado" }]) } });
    await page.reload();
    const row = page.getByRole("list", { name: "Tareas por prioridad" }).getByRole("listitem").filter({ has: page.getByRole("heading", { name: f.title, exact: true }) });
    const statusKeys: string[] = [];
    await page.route("**/api/tasks", async route => {
      if (route.request().method() !== "PATCH") return route.fallback();
      statusKeys.push(route.request().headers()["idempotency-key"]);
      const response = await route.fetch(); expect(response.status()).toBe(200);
      if (statusKeys.length === 1) return route.abort("failed");
      return route.fulfill({ response });
    });
    await row.getByRole("button", { name: "Marcar hecha", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Error de red" })).toBeVisible();
    await row.getByRole("button", { name: "Marcar hecha", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Tarea marcada como hecha" })).toBeVisible();
    expect(statusKeys).toHaveLength(2); expect(statusKeys[1]).toBe(statusKeys[0]);
    expect(await db.task.count({ where: { title: f.title } })).toBe(2);
    expect(await db.workflowInstance.count({ where: { workflowId: workflow.id } })).toBe(1);
    expect(await db.auditEvent.count({ where: { entityId: task.id, action: "task.update" } })).toBe(1);
  } finally { await f.cleanup(); }
});

test("tareas del espacio: acuse incompleto, reintento único y protección de cambios recientes", async ({ page }) => {
  const f = await fixture(page), keys: string[] = [];
  try {
    await page.goto(`/sites/${f.site.id}/tareas`);
    await page.getByRole("button", { name: "Nueva tarea", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Nueva tarea", exact: true });
    await dialog.getByLabel("Título", { exact: true }).fill(f.title);
    await page.route(`**/api/sites/${f.site.id}/tasks`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      keys.push(route.request().headers()["idempotency-key"]);
      const response = await route.fetch(); expect(response.status()).toBe(201);
      if (keys.length === 1) return route.fulfill({ status: 201, json: {} });
      return route.fulfill({ response });
    });
    await dialog.getByRole("button", { name: "Crear", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("El servidor no confirmó la tarea");
    await dialog.getByRole("button", { name: "Reintentar guardado" }).click();
    await expect(dialog).not.toBeVisible();
    expect(keys).toHaveLength(2); expect(keys[1]).toBe(keys[0]);
    await expect(page.getByRole("heading", { name: f.title, exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const task = await db.task.findFirstOrThrow({ where: { title: f.title } });
    expect(await db.task.count({ where: { title: f.title } })).toBe(1);
    await db.task.update({ where: { id: task.id }, data: { title: `${f.title} cambiado`, updatedAt: new Date(Date.now() + 1000) } });
    await page.getByRole("button", { name: "Marcar hecha", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Esta tarea cambió" })).toBeVisible();
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("todo");
    expect((await apiRequest(page).post("/api/tasks", { data: { title: "Fecha imposible", dueDate: "2030-02-31" } })).status()).toBe(400);
  } finally { await f.cleanup(); }
});

test("flujos: reintentar inicio y aprobación sin saltar pasos ni cambiar de decisión", async ({ page }, info) => {
  const f = await fixture(page), keys: Record<string, string[]> = { start: [], advance: [] };
  try {
    const workflow = await db.workflow.create({ data: { siteId: f.site.id, name: f.title, stepsJson: JSON.stringify([{ name: "Primera revisión", role: "abogado" }, { name: "Segunda revisión", role: "abogado" }, { name: "Entrega", role: "abogado" }]) } });
    await page.goto("/flujos");
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: f.title, exact: true }) });
    await page.route("**/api/workflows", async route => {
      const payload = route.request().postDataJSON();
      if (!keys[payload.action]) return route.continue();
      keys[payload.action].push(route.request().headers()["idempotency-key"]);
      const response = await route.fetch(); expect(response.ok()).toBe(true);
      if (keys[payload.action].length === 1) return route.abort("failed");
      return route.fulfill({ response });
    });
    await section.getByRole("button", { name: "Iniciar", exact: true }).click();
    await expect(section.getByRole("alert")).toContainText("No se pudo confirmar el flujo");
    await section.getByRole("button", { name: "Reintentar inicio" }).click();
    await expect(section.getByRole("button", { name: "Aprobar", exact: true })).toBeVisible();
    expect(keys.start).toHaveLength(2); expect(keys.start[1]).toBe(keys.start[0]);
    expect(await db.workflowInstance.count({ where: { workflowId: workflow.id } })).toBe(1);
    const instance = await db.workflowInstance.findFirstOrThrow({ where: { workflowId: workflow.id } });
    expect((await apiRequest(page).post("/api/workflows", { data: { action: "advance", instanceId: instance.id, decision: "approve" } })).status()).toBe(400);
    await section.getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect(section.getByRole("button", { name: "Reintentar aprobación" })).toBeVisible();
    await expect(section.getByRole("button", { name: "Rechazar", exact: true })).toBeDisabled();
    for (const [label, viewport] of [["desktop", { width: 1366, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
      await page.setViewportSize(viewport); await section.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await section.evaluate(element => {
        const parent = element.getBoundingClientRect();
        return [...element.querySelectorAll("button, [role=alert]")].every(child => {
          const box = child.getBoundingClientRect();
          return box.left >= parent.left && box.right <= parent.right;
        });
      })).toBe(true);
      await page.screenshot({ path: info.outputPath(`flujo-reintento-${label}.png`) });
    }
    await section.getByRole("button", { name: "Reintentar aprobación" }).click();
    await expect(section.getByRole("button", { name: "Aprobar", exact: true })).toBeEnabled();
    expect(keys.advance).toHaveLength(2); expect(keys.advance[1]).toBe(keys.advance[0]);
    expect((await db.workflowInstance.findUniqueOrThrow({ where: { id: instance.id } })).currentStep).toBe(1);
    expect(await db.auditEvent.count({ where: { entityId: instance.id, action: "workflow.advance" } })).toBe(1);
    await section.getByRole("button", { name: "Rechazar", exact: true }).click();
    await expect(section.getByRole("button", { name: "Aprobar", exact: true })).not.toBeVisible();
    expect((await db.workflowInstance.findUniqueOrThrow({ where: { id: instance.id } })).status).toBe("rejected");
  } finally { await f.cleanup(); }
});
