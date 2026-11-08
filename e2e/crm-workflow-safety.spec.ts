import { expect, test, type BrowserContext } from "@playwright/test";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { withRejectedAudit } from "../src/lib/testing/audit-failure";
import { loginAs, authenticateApiRequests, apiRequest } from "./helpers";

assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) throw Error("Use the explicit disposable browser database");
const users: string[] = [], causes: string[] = [], sites: string[] = [], clientNames: string[] = [];
const contexts: BrowserContext[] = [];
let password = "";
test.beforeAll(async () => { password = await hash("lexopen", 10); });
test.afterAll(async () => { await prisma.$disconnect(); });
test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
  await prisma.site.deleteMany({ where: { id: { in: sites.splice(0) } } });
  await prisma.documento.deleteMany({ where: { causaId: { in: causes } } });
  await prisma.causa.deleteMany({ where: { id: { in: causes.splice(0) } } });
  await prisma.cliente.deleteMany({ where: { razonSocial: { in: clientNames.splice(0) } } });
  await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
  await prisma.commandExecution.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } });
});
async function professional() {
  const row = await prisma.user.create({ data: { name: "Profesional ficticio de regresión", role: "abogado", email: `${randomUUID()}@safety-fixture.invalid`, password } });
  users.push(row.id); return row;
}

test("Clientes aplica el muro ético a los contadores de la API y la pantalla tras revocar acceso", async ({ page }) => {
  test.setTimeout(90_000);
  const owner = await professional(), outsider = await professional();
  const name = `Privacidad CRM ${randomUUID()}`; clientNames.push(name);
  const client = await prisma.cliente.create({ data: { razonSocial: name } });
  const cause = await prisma.causa.create({ data: { titulo: name, materia: "civil", tribunal: "Órgano ficticio", acceso: "equipo", abogadoId: owner.id, clienteId: client.id } }); causes.push(cause.id);
  await prisma.documento.create({ data: { nombre: "Documento ficticio reservado", clienteId: client.id, causaId: cause.id, autorId: owner.id } });
  await prisma.tramite.create({ data: { titulo: "Trámite ficticio reservado", causaId: cause.id } });
  await loginAs(page, outsider.email); await authenticateApiRequests(page);
  const api = `/api/clientes?q=${encodeURIComponent(name)}`;
  async function expectCounts(count: number) {
    const response = await page.request.get(api); expect(response.ok()).toBe(true);
    expect(await response.json()).toEqual([expect.objectContaining({ id: client.id, causasCount: count, documentosCount: count, tramitesPendientes: count })]);
    await page.goto(`/clientes?q=${encodeURIComponent(name)}`, { waitUntil: "networkidle" });
    const cells = page.getByRole("row").filter({ hasText: name }).getByRole("cell");
    for (const index of [2, 3, 4]) await expect(cells.nth(index)).toHaveText(String(count));
  }
  expect((await page.request.get(`/api/causas/${cause.id}`)).status()).toBe(404);
  await expectCounts(0);
  const membership = await prisma.causaMiembro.create({ data: { causaId: cause.id, userId: outsider.id, rol: "lectura" } });
  await expectCounts(1);
  await prisma.causaMiembro.delete({ where: { id: membership.id } });
  await expectCounts(0);
});

test("Flujos rechaza sólo lectura y desactivados, conserva un único inicio y protege el paso esperado", async ({ page, browser }, info) => {
  test.setTimeout(90_000);
  const owner = await professional(), reader = await professional();
  const name = `Flujo ficticio ${randomUUID()}`;
  const cause = await prisma.causa.create({ data: { titulo: name, materia: "civil", tribunal: "Órgano ficticio", acceso: "equipo", abogadoId: owner.id, miembros: { create: { userId: reader.id, rol: "lectura" } } } }); causes.push(cause.id);
  const site = await prisma.site.create({ data: { name, slug: randomUUID(), causaId: cause.id } }); sites.push(site.id);
  const workflow = await prisma.workflow.create({ data: { name, siteId: site.id, active: false, stepsJson: JSON.stringify([{ name: "Revisión", role: "abogado" }, { name: "Entrega", role: "abogado" }]) } });
  await loginAs(page, reader.email); await authenticateApiRequests(page);
  const data = { action: "start", workflowId: workflow.id };
  expect((await apiRequest(page).post("/api/workflows", { data })).status()).toBe(403);
  const ownerContext = await browser.newContext({ baseURL: info.project.use.baseURL, locale: "es-CL" }); contexts.push(ownerContext);
  const ownerPage = await ownerContext.newPage(); await loginAs(ownerPage, owner.email); await authenticateApiRequests(ownerPage);
  expect((await ownerContext.request.post("/api/workflows", { data })).status()).toBe(409);
  await ownerPage.goto("/flujos");
  await expect(ownerPage.locator("section").filter({ has: ownerPage.getByRole("heading", { name, exact: true }) }).getByRole("button", { name: "Desactivado", exact: true })).toBeDisabled();
  await prisma.workflow.update({ where: { id: workflow.id }, data: { active: true } });
  const headers = { "Idempotency-Key": randomUUID() };
  const starts = await Promise.all([ownerContext.request.post("/api/workflows", { data, headers }), ownerContext.request.post("/api/workflows", { data, headers })]);
  for (const response of starts) expect(response.status(), await response.text()).toBe(201);
  const [first, second] = await Promise.all(starts.map(response => response.json()));
  expect(first.id).toBe(second.id);
  expect(await prisma.workflowInstance.count({ where: { workflowId: workflow.id } })).toBe(1);
  const advance = { action: "advance", instanceId: first.id, decision: "approve", expectedStep: 0 };
  expect((await apiRequest(page).post("/api/workflows", { data: advance })).status()).toBe(403);
  expect((await ownerContext.request.post("/api/workflows", { data: advance, headers: { "Idempotency-Key": randomUUID() } })).status()).toBe(200);
  expect((await ownerContext.request.post("/api/workflows", { data: advance, headers: { "Idempotency-Key": randomUUID() } })).status()).toBe(409);
  expect((await prisma.workflowInstance.findUniqueOrThrow({ where: { id: first.id } })).currentStep).toBe(1);
});

test("CRM revierte un fallo de auditoría y reutiliza el envío del formulario tras perder la respuesta y recargar", async ({ page }) => {
  test.setTimeout(120_000);
  const owner = await professional(); await loginAs(page, owner.email); await authenticateApiRequests(page);
  const rollbackName = `Rollback CRM ${randomUUID()}`; clientNames.push(rollbackName);
  const data = { razonSocial: rollbackName }, headers = { "Idempotency-Key": randomUUID() };
  await withRejectedAudit(owner.id, "cliente.create", async () => {
    const response = await apiRequest(page).post("/api/clientes", { data, headers });
    expect(response.status()).toBe(500);
    expect(await prisma.cliente.count({ where: { razonSocial: rollbackName } })).toBe(0);
  });
  const restored = await apiRequest(page).post("/api/clientes", { data, headers }); expect(restored.status()).toBe(201);
  const repeated = await apiRequest(page).post("/api/clientes", { data, headers }); expect(repeated.status()).toBe(201);
  expect((await restored.json()).id).toBe((await repeated.json()).id);
  expect(await prisma.cliente.count({ where: { razonSocial: rollbackName } })).toBe(1);
  const rollbackClient = await prisma.cliente.findFirstOrThrow({ where: { razonSocial: rollbackName } });
  await withRejectedAudit(owner.id, "cliente.update", async () => {
    expect((await apiRequest(page).patch(`/api/clientes/${rollbackClient.id}`, { data: { telefono: "123456789" } })).status()).toBe(500);
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: rollbackClient.id } })).telefono).toBeNull();
  });
  await withRejectedAudit(owner.id, "cliente.delete", async () => {
    expect((await apiRequest(page).delete(`/api/clientes/${rollbackClient.id}`)).status()).toBe(500);
    expect(await prisma.cliente.count({ where: { id: rollbackClient.id } })).toBe(1);
  });
  expect((await apiRequest(page).patch(`/api/clientes/${rollbackClient.id}`, { data: { telefono: "123456789" } })).status()).toBe(200);
  expect((await apiRequest(page).delete(`/api/clientes/${rollbackClient.id}`)).status()).toBe(200);

  const formName = `Respuesta perdida CRM ${randomUUID()}`; clientNames.push(formName);
  const requestKeys: Array<string | undefined> = [];
  let loseFirstResponse = true;
  await page.route("**/api/clientes", async route => {
    if (route.request().method() !== "POST") return route.continue();
    requestKeys.push(route.request().headers()["idempotency-key"]);
    const response = await route.fetch(); expect(response.status()).toBe(201);
    if (loseFirstResponse) { loseFirstResponse = false; return route.abort("failed"); }
    await route.fulfill({ response });
  });
  async function submitForm() {
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nuevo cliente", exact: true });
    await dialog.getByRole("textbox", { name: "Razón social / nombre", exact: true }).fill(formName);
    await dialog.getByRole("button", { name: "Crear cliente", exact: true }).click();
  }
  await page.goto("/clientes"); await submitForm();
  await expect(page.getByRole("dialog", { name: "Nuevo cliente", exact: true }).getByRole("alert")).toHaveText("Error de red");
  expect(await prisma.cliente.count({ where: { razonSocial: formName } })).toBe(1);
  await page.reload(); await submitForm();
  await expect(page).toHaveURL(/\/clientes\/[^/?]+$/);
  await expect(page.getByRole("heading", { name: formName, exact: true })).toBeVisible();
  expect(requestKeys).toHaveLength(2); expect(requestKeys[0]).toBeTruthy(); expect(requestKeys[1]).toBe(requestKeys[0]);
  expect(await prisma.cliente.count({ where: { razonSocial: formName } })).toBe(1);
  const client = await prisma.cliente.findFirstOrThrow({ where: { razonSocial: formName } });
  expect(await prisma.auditEvent.count({ where: { action: "cliente.create", entityId: client.id } })).toBe(1);
});
