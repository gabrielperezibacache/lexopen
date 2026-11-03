import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";
import type { AudienceHubCatalog } from "../src/lib/hearings/hub-types";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const tag = randomUUID(), email = `audience-hub-${tag}@example.test`;
let ownerId = "", causaId = "", hiddenCaseId = "", activeId = "", closedId = "", otherId = "", inaccessibleId = "";

test.beforeAll(async () => {
  const seed = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" }, select: { id: true, password: true } });
  const colleague = await db.user.findUniqueOrThrow({ where: { email: "asistente@estudio.cl" }, select: { id: true } });
  ownerId = (await db.user.create({ data: { email, name: "Profesional de audiencias · Demo", role: "abogado", password: seed.password } })).id;
  causaId = (await db.causa.create({ data: { titulo: "Causa demostrativa para audiencias", rit: "DEMO C-204-2026", materia: "civil", tribunal: "Tribunal de demostración", acceso: "equipo", abogadoId: ownerId } })).id;
  hiddenCaseId = (await db.causa.create({ data: { titulo: "CAUSA AJENA RESERVADA DEL HUB", materia: "civil", tribunal: "Tribunal reservado", acceso: "equipo", abogadoId: seed.id } })).id;
  await db.causaMiembro.create({ data: { causaId, userId: colleague.id, rol: "colaborador" } });
  activeId = (await db.hearingWorkspace.create({ data: { causaId, ownerId, title: "Audiencia preparatoria · Demostración", scheduledFor: new Date("2026-11-11T12:30:00.000Z") } })).id;
  closedId = (await db.hearingWorkspace.create({ data: { causaId, ownerId, title: "Audiencia anterior · Demostración", status: "closed" } })).id;
  otherId = (await db.hearingWorkspace.create({ data: { causaId, ownerId: seed.id, title: "MESA PRIVADA DE OTRO PROFESIONAL" } })).id;
  inaccessibleId = (await db.hearingWorkspace.create({ data: { causaId: hiddenCaseId, ownerId, title: "MESA DE CAUSA SIN ACCESO ACTUAL" } })).id;
});

test.afterAll(async () => {
  try {
    const causes = [causaId, hiddenCaseId].filter(Boolean);
    if (causes.length) { await db.hearingWorkspace.deleteMany({ where: { causaId: { in: causes } } }); await db.causa.deleteMany({ where: { id: { in: causes } } }); }
    if (ownerId) { await db.auditEvent.deleteMany({ where: { actorId: ownerId } }); await db.user.deleteMany({ where: { id: ownerId } }); }
  } finally { await db.$disconnect(); }
});

test("panel independiente: mesas propias, búsqueda, recuperación, creación y privacidad por causa", async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  await loginAs(page, email);
  let failCatalog = true;
  await page.route(url => url.pathname === "/api/hearings", async route => failCatalog ? route.fulfill({ status: 503, json: { error: "Catálogo temporalmente no disponible." } }) : route.continue());
  await page.goto("/audiencias");
  const hub = page.getByTestId("audience-hub");
  await expect(hub.locator(".audience-hub-error[role=alert]")).toContainText("Catálogo temporalmente no disponible.");
  failCatalog = false;
  await hub.getByRole("button", { name: "Reintentar carga de mesas", exact: true }).click();
  await expect(hub.getByTestId("audience-hub-workspace")).toHaveCount(1);
  await expect(hub).toContainText("Audiencia preparatoria · Demostración");
  await expect(hub).toContainText("09:30 h · Chile");
  await expect(hub).not.toContainText("MESA PRIVADA DE OTRO PROFESIONAL");
  await expect(hub).not.toContainText("CAUSA AJENA RESERVADA DEL HUB");
  await expect(hub).not.toContainText("MESA DE CAUSA SIN ACCESO ACTUAL");
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 360, height: 900 }]] as const) {
    await page.setViewportSize(viewport);
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, left: 0, behavior: "instant" }); });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`audience-hub-${name}.png`), animations: "disabled" });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await hub.getByRole("button", { name: "Cerradas", exact: true }).click();
  await expect(hub.getByTestId("audience-hub-workspace")).toHaveCount(1);
  await expect(hub).toContainText("Audiencia anterior · Demostración");
  await hub.getByRole("button", { name: "Todas", exact: true }).click();
  await expect(hub.getByTestId("audience-hub-workspace")).toHaveCount(2);
  await hub.getByRole("searchbox", { name: "Buscar causa o mesa", exact: true }).fill("MATERIAL-INEXISTENTE-EN-ESTA-PRUEBA");
  await hub.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(hub.getByRole("heading", { name: "No hay mesas con esta búsqueda", exact: true })).toBeVisible();
  await hub.getByRole("button", { name: "Limpiar búsqueda", exact: true }).click();
  await expect(hub.getByTestId("audience-hub-workspace")).toHaveCount(2);
  const result = await page.request.get("/api/hearings?status=all");
  expect(result.status(), await result.text()).toBe(200);
  const catalog = await result.json() as AudienceHubCatalog;
  expect(new Set(catalog.workspaces.map(item => item.id))).toEqual(new Set([activeId, closedId]));
  expect(catalog.workspaces.map(item => item.id)).not.toContain(otherId);
  expect(catalog.workspaces.map(item => item.id)).not.toContain(inaccessibleId);
  expect(catalog.causas.map(item => item.id)).not.toContain(hiddenCaseId);
  await hub.getByTestId("audience-hub-workspace").filter({ hasText: "Audiencia preparatoria · Demostración" }).getByRole("link", { name: "Abrir panel en vivo", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/audiencias/${activeId}$`));
  await expect(page.getByRole("region", { name: "Acompañante de audiencia", exact: true }).getByRole("heading", { name: "Audiencia en vivo", exact: true })).toBeVisible();
  expect(await db.hearingLiveAudioSession.count({ where: { workspaceId: activeId } })).toBe(0);
  expect((await db.hearingLiveState.findUnique({ where: { workspaceId: activeId } }))?.phase || "idle").toBe("idle");
  await page.goto("/audiencias");
  await hub.getByRole("button", { name: "Preparar audiencia", exact: true }).click();
  await hub.getByRole("combobox", { name: "Causa", exact: true }).selectOption(causaId);
  await hub.getByLabel("Nombre de la audiencia", { exact: true }).fill("Nueva audiencia · Demostración");
  const pendingCreation = page.waitForResponse(response => new URL(response.url()).pathname === `/api/causas/${causaId}/hearings` && response.request().method() === "POST");
  await hub.getByRole("button", { name: "Crear y abrir panel", exact: true }).click();
  const createdResponse = await pendingCreation;
  expect(createdResponse.status(), await createdResponse.text()).toBe(201);
  const createdId = (await createdResponse.json()).id as string;
  await expect(page).toHaveURL(new RegExp(`/audiencias/${createdId}$`));
  await expect(page.getByRole("region", { name: "Acompañante de audiencia", exact: true }).getByRole("heading", { name: "Audiencia en vivo", exact: true })).toBeVisible();
  expect(await db.hearingLiveAudioSession.count({ where: { workspaceId: createdId } })).toBe(0);
  const colleagueContext = await browser.newContext({ locale: "es-CL" });
  const colleaguePage = await colleagueContext.newPage();
  await loginAs(colleaguePage, "asistente@estudio.cl");
  const otherCatalogResponse = await colleaguePage.request.get("/api/hearings?status=all");
  expect(otherCatalogResponse.status()).toBe(200);
  const otherCatalog = await otherCatalogResponse.json() as AudienceHubCatalog;
  expect(otherCatalog.workspaces.map(item => item.id)).not.toContain(createdId);
  expect((await colleaguePage.request.get(`/api/causas/${causaId}/hearings/${createdId}`)).status()).toBe(404);
  await colleaguePage.goto(`/audiencias/${createdId}`);
  await expect(colleaguePage.getByRole("heading", { name: "Página no encontrada", exact: true })).toBeVisible();
  await expect(colleaguePage.locator("body")).not.toContainText("Nueva audiencia · Demostración");
  await colleagueContext.close();
});
