import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { CSRF_COOKIE, CSRF_HEADER } from "../src/lib/auth/csrf-constants";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const tag = randomUUID();
const emails = { delegated: `delegated-${tag}@example.test`, restricted: `restricted-${tag}@example.test`, auditor: `auditor-${tag}@example.test` };
const actorIds: string[] = [];

test.beforeAll(async () => {
  const { password } = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" }, select: { password: true } });
  for (const [key, grants, revokes] of [
    ["delegated", "host.admin", "assistant.use"],
    ["restricted", "", "host.admin,assistant.use"],
    ["auditor", "audit.read", "assistant.use"],
  ] as const) {
    const user = await db.user.create({ data: { name: `Usuario ${key}`, email: emails[key], role: "abogado", password, capabilityGrants: grants, capabilityRevokes: revokes } });
    actorIds.push(user.id);
  }
});

test.afterAll(async () => {
  try {
    await db.integrationConfig.deleteMany({ where: { provider: { in: actorIds.map(id => `codex:${id}`) } } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: actorIds } } });
    await db.user.deleteMany({ where: { id: { in: actorIds } } });
  } finally { await db.$disconnect(); }
});

test("la delegación administra el estudio y la revocación de IA permite cerrar la conexión propia", async ({ page }) => {
  await loginAs(page, emails.delegated);
  await page.goto("/configuracion#work-country");
  await expect(page.locator("#work-country").getByRole("combobox", { name: "País", exact: true })).toBeVisible();
  await expect(page.getByTestId("users-admin-panel")).toHaveCount(1);
  await page.goto("/cuenta#permisos");
  const permissions = page.getByTestId("my-permissions");
  await expect(permissions).toContainText("Puedes administrar la configuración compartida");
  await permissions.getByText("Ver mis permisos efectivos", { exact: true }).click();
  await expect(permissions.locator('[data-capability="host.admin"]')).toContainText("Permiso adicional");
  await expect(permissions.locator('[data-capability="assistant.use"]')).toContainText("Revocado");
  await expect(page.locator("#codex")).toBeVisible();
  const state = await page.request.get("/api/integrations/codex");
  expect(state.status()).toBe(200);
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === CSRF_COOKIE)?.value;
  expect(csrf).toBeTruthy();
  const headers = { [CSRF_HEADER]: csrf!, origin: new URL(page.url()).origin };
  expect((await page.request.post("/api/integrations/codex", { data: { action: "connect" }, headers })).status()).toBe(403);
  expect((await page.request.post("/api/integrations/codex", { data: { action: "save", enabled: false, model: "" }, headers })).status()).toBe(200);
});

test("un usuario sin administración conserva sus preferencias y no cambia los ajustes compartidos", async ({ page }, info) => {
  await loginAs(page, emails.restricted);
  await page.goto("/configuracion");
  await expect(page.locator("#cuenta-personal")).toHaveCount(1);
  await expect(page.getByTestId("users-admin-panel")).toHaveCount(0);
  await expect(page.locator("#work-country")).toHaveCount(0);
  expect((await page.request.get("/api/admin/config-snapshot")).status()).toBe(403);
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === CSRF_COOKIE)?.value;
  expect(csrf).toBeTruthy();
  const headers = { [CSRF_HEADER]: csrf!, origin: new URL(page.url()).origin };
  expect((await page.request.patch("/api/configuracion/pais", { data: { country: "CL" }, headers })).status()).toBe(403);
  expect((await page.request.patch("/api/configuracion", { data: { name: "Cambio no permitido" }, headers })).status()).toBe(403);
  await page.goto("/cuenta#permisos");
  const permissions = page.getByTestId("my-permissions");
  await permissions.getByText("Ver mis permisos efectivos", { exact: true }).click();
  await expect(permissions.locator('[data-capability="host.admin"]')).toContainText("No habilitado");
  await expect(permissions.locator('[data-capability="host.admin"]')).toContainText("Revocado");
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await permissions.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`mis-permisos-${width}.png`), animations: "disabled" });
  }
});

test("ver auditoría depende de su permiso y no concede administración", async ({ page }) => {
  await loginAs(page, emails.auditor);
  await page.goto("/auditoria");
  await expect(page).toHaveURL(/\/auditoria$/);
  await expect(page.getByRole("heading", { name: "Auditoría", exact: true })).toBeVisible();
  expect((await page.request.get("/api/admin/config-snapshot")).status()).toBe(403);
  await loginAs(page, emails.delegated);
  await page.goto("/auditoria");
  await expect(page).toHaveURL(/\/cuenta#permisos$/);
  await expect(page.getByTestId("my-permissions")).toContainText("Puedes administrar la configuración compartida");
});
