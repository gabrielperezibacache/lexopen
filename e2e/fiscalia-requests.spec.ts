import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs, apiRequest } from "./helpers";
import { addCivilDays, santiagoDateKey } from "../src/lib/chile-time";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
test.afterAll(() => db.$disconnect());
async function fixture(page: Page) {
  const tag = randomUUID();
  const owner = await db.user.create({ data: { name: "Fiscalía ficticia", email: `${tag}@fiscalia-ui.invalid`, role: "abogado", password: await hash("lexopen", 10) } });
  const cause = await db.causa.create({ data: { titulo: `Causa penal ${tag}`, tribunal: "Ficticio", materia: "penal", acceso: "equipo", abogadoId: owner.id, ruc: "2600000000-1" } });
  await loginAs(page, owner.email);
  return { owner, cause, title: `Copia para revisión ${tag}`, cleanup: async () => {
    await db.causa.delete({ where: { id: cause.id } }); await db.commandExecution.deleteMany({ where: { ownerId: owner.id } }); await db.auditEvent.deleteMany({ where: { actorId: owner.id } }); await db.user.delete({ where: { id: owner.id } });
  } };
}

test("Mi Fiscalía guarda una sola solicitud tras perder la respuesta y conserva su seguimiento", async ({ page }, info) => {
  test.setTimeout(90_000);
  const f = await fixture(page), keys: string[] = [];
  try {
    await page.goto(`/mi-fiscalia?causaId=${f.cause.id}`);
    const portal = page.getByRole("link", { name: "Abrir Mi Fiscalía con ClaveÚnica", exact: true });
    await expect(portal).toHaveAttribute("href", "https://agenda.minpublico.cl/app/fiscalia-en-linea/#/login");
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Nueva solicitud", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Asunto", { exact: true }).fill(f.title);
    await dialog.getByLabel("Tipo", { exact: true }).selectOption("copia");
    await dialog.getByLabel("Contenido", { exact: true }).fill("Solicito copia de los antecedentes para revisar la causa.");
    await page.route("**/api/fiscalia/solicitudes", async route => {
      if (route.request().method() !== "POST") return route.continue();
      keys.push(route.request().headers()["idempotency-key"]);
      if (keys.length > 1) return route.continue();
      const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort("failed");
    });
    await dialog.getByRole("button", { name: "Guardar solicitud", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("sin duplicar");
    await expect(dialog.getByLabel("Asunto", { exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
    await expect(page.getByRole("heading", { name: f.title, exact: true })).toBeVisible();
    expect(keys[0]).toBe(keys[1]); expect(await db.fiscaliaRequest.count({ where: { causaId: f.cause.id } })).toBe(1);
    await page.getByRole("button", { name: `Editar ${f.title}`, exact: true }).click();
    await dialog.getByLabel("Estado", { exact: true }).selectOption("ready");
    await dialog.getByRole("button", { name: "Guardar solicitud", exact: true }).click();
    await expect(page.getByText("Lista para presentar · Copia de documentos", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Editar ${f.title}`, exact: true }).click();
    await dialog.getByLabel("Estado", { exact: true }).selectOption("submitted");
    await dialog.getByLabel("Folio del comprobante", { exact: true }).fill(`FICTICIO-${"A".repeat(100)}`);
    await dialog.getByLabel("Fecha de presentación", { exact: true }).fill(addCivilDays(santiagoDateKey(new Date()), -1));
    await dialog.getByRole("checkbox", { name: "Confirmo que la presenté en Mi Fiscalía y tengo su comprobante." }).check();
    await dialog.getByRole("button", { name: "Guardar solicitud", exact: true }).click();
    await expect(page.getByText("Enviada · registro manual · Copia de documentos", { exact: true })).toBeVisible();
    const row = await db.fiscaliaRequest.findFirstOrThrow({ where: { causaId: f.cause.id } });
    const file = await page.request.get(`/api/fiscalia/solicitudes/${row.id}/export`);
    expect(file.ok()).toBe(true); expect(file.headers()["content-type"]).toContain("text/plain"); expect(await file.text()).toContain("no es un comprobante oficial");
    await page.goto(`/causas/${f.cause.id}`);
    await expect(page.getByTestId("case-status").getByText(`Esperando respuesta de Mi Fiscalía: ${f.title}`, { exact: true })).toBeVisible();
    await page.goto(`/mi-fiscalia?causaId=${f.cause.id}`);
    await page.getByRole("button", { name: `Editar ${f.title}`, exact: true }).click();
    await expect(dialog.getByLabel("Contenido", { exact: true })).toHaveJSProperty("readOnly", true);
    await dialog.getByLabel("Estado", { exact: true }).selectOption("answered");
    await dialog.getByLabel("Respuesta recibida", { exact: true }).fill("Respuesta ficticia para revisión del abogado.");
    await dialog.getByLabel("Fecha de respuesta", { exact: true }).fill(santiagoDateKey(new Date()));
    await dialog.getByRole("button", { name: "Guardar solicitud", exact: true }).click();
    await expect(page.getByText("Respuesta registrada · Copia de documentos", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByTestId("fiscalia-workspace").screenshot({ path: info.outputPath("mi-fiscalia-mobile.png") });
  } finally { await f.cleanup(); }
});

test("Mi Fiscalía aplica el muro de causa y la lectura sin conceder acceso a credenciales", async ({ page }) => {
  const f = await fixture(page);
  try {
    const record = await db.fiscaliaRequest.create({ data: { causaId: f.cause.id, creatorId: f.owner.id, title: "Preparación reservada", kind: "copia", body: "Contenido ficticio" } });
    await db.user.update({ where: { id: f.owner.id }, data: { capabilityRevokes: "causa.write" } });
    await page.goto(`/mi-fiscalia?causaId=${f.cause.id}`);
    await expect(page.getByRole("heading", { name: "Preparación reservada", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nueva solicitud", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Editar Preparación/ })).toHaveCount(0);
    expect((await apiRequest(page).post("/api/fiscalia/solicitudes", { data: { causaId: f.cause.id, title: "No crear", kind: "copia" } })).status()).toBe(403);
    await db.user.update({ where: { id: f.owner.id }, data: { capabilityRevokes: "causa.read,causa.write" } });
    expect((await page.request.get(`/api/fiscalia/solicitudes/${record.id}/export`)).status()).toBe(404);
    expect((await page.request.get(`/api/fiscalia/solicitudes?causaId=${f.cause.id}`)).status()).toBe(404);
  } finally { await f.cleanup(); }
});

test("plazos por causa conserva el ámbito al navegar meses y vistas", async ({ page }) => {
  const f = await fixture(page);
  const other = await db.causa.create({ data: { titulo: "Otra causa ficticia", tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: f.owner.id } });
  try {
    await db.plazo.createMany({ data: [
      { titulo: "Plazo de causa seleccionada", causaId: f.cause.id, fechaLimite: new Date("2026-11-24"), responsableId: f.owner.id },
      { titulo: "Plazo de otra causa", causaId: other.id, fechaLimite: new Date("2026-11-24"), responsableId: f.owner.id },
      { titulo: "Plazo mes siguiente", causaId: f.cause.id, fechaLimite: new Date("2026-12-24"), responsableId: f.owner.id },
    ] });
    await page.goto(`/plazos?mes=2026-11&causaId=${f.cause.id}`);
    await expect(page.getByRole("heading", { name: "Plazo de causa seleccionada", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Plazo de otra causa", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Mes siguiente", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`mes=2026-12&causaId=${f.cause.id}`));
    await expect(page.getByRole("heading", { name: "Plazo mes siguiente", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Mis vencidos pendientes", exact: true }).click();
    await expect(page.getByLabel("Filtrar por causa", { exact: true })).toHaveValue(f.cause.id);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await db.user.update({ where: { id: f.owner.id }, data: { capabilityRevokes: "causa.read" } });
    // Next may stream not-found with HTTP 200; the protected UI must never render.
    await page.goto(`/plazos?causaId=${other.id}`);
    await expect(page.getByRole("heading", { name: "Página no encontrada", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Plazo de otra causa", exact: true })).toHaveCount(0);
  } finally { await db.causa.delete({ where: { id: other.id } }); await f.cleanup(); }
});

test("Mi Fiscalía permite descartar un borrador sin fingir una presentación", async ({ page }) => {
  const f = await fixture(page);
  try {
    const response = await apiRequest(page).post("/api/fiscalia/solicitudes", { data: { causaId: f.cause.id, title: "Borrador sin presentar", kind: "copia" } });
    expect(response.status()).toBe(201);
    const { id } = await response.json();
    await page.goto(`/mi-fiscalia?causaId=${f.cause.id}`);
    await page.getByRole("button", { name: "Editar Borrador sin presentar", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Estado", { exact: true }).selectOption("cancelled");
    await page.getByRole("button", { name: "Guardar solicitud", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sin solicitudes con estos filtros", exact: true })).toBeVisible();
    await page.goto(`/mi-fiscalia?causaId=${f.cause.id}&status=cancelled`);
    await expect(page.getByRole("heading", { name: "Borrador sin presentar", exact: true })).toBeVisible();
    const row = await db.fiscaliaRequest.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("cancelled"); expect(row.folio).toBeNull(); expect(row.submittedAt).toBeNull();
    expect(await db.fiscaliaRequestEvent.count({ where: { requestId: id } })).toBe(2);
  } finally { await f.cleanup(); }
});
