import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs, authenticateApiRequests, apiRequest } from "./helpers";

test.use({ timezoneId: "Asia/Tokyo" });
const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
test.afterAll(() => db.$disconnect());
async function fixture(page: Page) {
  const tag = randomUUID();
  const owner = await db.user.create({ data: { email: `${tag}@agenda-ui.invalid`, name: "Agenda ficticia", role: "abogado", password: await hash("lexopen", 10) } });
  const cause = await db.causa.create({ data: { titulo: `Causa ${tag}`, tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } });
  await loginAs(page, owner.email);
  await authenticateApiRequests(page);
  return { owner, cause, title: `Evento ${tag}`, cleanup: async () => {
    await db.evento.deleteMany({ where: { responsableId: owner.id } });
    await db.causa.delete({ where: { id: cause.id } });
    await db.commandExecution.deleteMany({ where: { ownerId: owner.id } });
    await db.auditEvent.deleteMany({ where: { actorId: owner.id } });
    await db.notification.deleteMany({ where: { userId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  } };
}
async function openEvent(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  await page.goto("/calendario?ym=2026-11&tipo=evento&nuevo=1");
  await page.getByLabel("Título", { exact: true }).fill(f.title);
  await page.getByLabel("Causa", { exact: true }).selectOption(f.cause.id);
}

test("agenda: respuesta perdida, reintento único y horas del navegador preservadas", async ({ page }, info) => {
  const f = await fixture(page);
  const keys: string[] = [], bodies: string[] = [];
  let id = "";
  try {
    await openEvent(page, f);
    await page.locator("form").getByLabel("Inicio", { exact: true }).fill("2026-11-24T10:00");
    await page.getByLabel("Fin (opcional)", { exact: true }).fill("2026-11-24T12:00");
    await page.route("**/api/eventos", async route => {
      if (route.request().method() !== "POST") return route.continue();
      keys.push(route.request().headers()["idempotency-key"]);
      bodies.push(route.request().postData()!);
      if (keys.length > 1) return route.continue();
      const response = await route.fetch();
      expect(response.status(), await response.text()).toBe(201);
      id = (await response.json()).id;
      await route.abort("failed");
    });
    await page.getByRole("button", { name: "Crear evento", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "No se pudo confirmar el evento" })).toBeVisible();
    await expect(page.getByLabel("Título", { exact: true })).toBeDisabled();
    for (const [label, viewport] of [["desktop", { width: 1366, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
      await page.setViewportSize(viewport);
      await page.getByRole("button", { name: "Reintentar guardado", exact: true }).scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`agenda-reintento-${label}.png`) });
    }
    await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
    await expect(page.getByRole("button", { name: `Editar ${f.title}`, exact: true })).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy(); expect(keys[1]).toBe(keys[0]); expect(bodies[1]).toBe(bodies[0]);
    expect(await db.evento.count({ where: { causaId: f.cause.id } })).toBe(1);
    expect((await db.evento.findUniqueOrThrow({ where: { id } })).inicio.toISOString()).toBe("2026-11-24T01:00:00.000Z");
    await page.getByRole("button", { name: `Editar ${f.title}`, exact: true }).click();
    await expect(page.locator("form").getByLabel("Inicio", { exact: true })).toHaveValue("2026-11-24T10:00");
    await page.getByLabel("Fin (opcional)", { exact: true }).fill("2026-11-24T09:00");
    await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "El fin debe ser posterior" })).toBeVisible();
    expect((await db.evento.findUniqueOrThrow({ where: { id } })).fin!.toISOString()).toBe("2026-11-24T03:00:00.000Z");
  } finally { await f.cleanup(); }
});

test("agenda: día completo conserva sus días al editar, mover y exportar", async ({ page }) => {
  const f = await fixture(page);
  try {
    await openEvent(page, f);
    await page.getByRole("checkbox", { name: "Todo el día", exact: true }).check();
    await page.locator("form").getByLabel("Inicio", { exact: true }).fill("2026-11-24");
    await page.getByLabel("Último día (opcional)", { exact: true }).fill("2026-11-25");
    await page.getByRole("button", { name: "Crear evento", exact: true }).click();
    const group = page.getByRole("group", { name: `Evento ${f.title}`, exact: true });
    await expect(group).toBeVisible();
    const event = await db.evento.findFirstOrThrow({ where: { causaId: f.cause.id } });
    expect(event.inicio.toISOString()).toBe("2026-11-24T00:00:00.000Z");
    expect(event.fin!.toISOString()).toBe("2026-11-26T00:00:00.000Z");
    await page.getByRole("button", { name: `Editar ${f.title}`, exact: true }).click();
    await expect(page.locator("form").getByLabel("Inicio", { exact: true })).toHaveValue("2026-11-24");
    await expect(page.getByLabel("Último día (opcional)", { exact: true })).toHaveValue("2026-11-25");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await group.locator("summary").click();
    await page.getByLabel(`Mover ${f.title} a otro día`, { exact: true }).fill("2026-11-26");
    await group.getByRole("button", { name: "Mover", exact: true }).click();
    await expect.poll(async () => (await db.evento.findUniqueOrThrow({ where: { id: event.id } })).inicio.toISOString()).toBe("2026-11-26T00:00:00.000Z");
    expect((await db.evento.findUniqueOrThrow({ where: { id: event.id } })).fin!.toISOString()).toBe("2026-11-28T00:00:00.000Z");
    const response = await page.request.get("/api/calendario/ics?desde=2026-11-01&hasta=2026-12-01");
    expect(response.ok()).toBe(true);
    const ics = await response.text();
    expect(ics).toContain("DTSTART;VALUE=DATE:20261126"); expect(ics).toContain("DTEND;VALUE=DATE:20261128");
  } finally { await f.cleanup(); }
});

test("agenda: el aviso de solapamiento permanece después de guardar", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const f = await fixture(page);
  try {
    const response = await apiRequest(page).post("/api/eventos", { data: { titulo: "Otro evento", causaId: f.cause.id, inicio: "2026-11-24T01:30:00Z", fin: "2026-11-24T03:30:00Z" } });
    expect(response.status()).toBe(201);
    await openEvent(page, f);
    await page.locator("form").getByLabel("Inicio", { exact: true }).fill("2026-11-24T10:00");
    await page.getByLabel("Fin (opcional)", { exact: true }).fill("2026-11-24T12:00");
    await page.getByRole("button", { name: "Crear evento", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Conflicto de agenda" })).toBeVisible();
    expect(errors).toEqual([]);
    await expect(page.getByRole("button", { name: `Editar ${f.title}`, exact: true })).toBeVisible();
    expect((await page.request.get("/api/eventos?desde=2026-02-31&hasta=2026-12-01")).status()).toBe(400);
    expect((await page.request.get("/api/calendario/ics?desde=2026-12-01&hasta=2026-11-01")).status()).toBe(400);
    await page.goto("/calendario?ym=2092-11&tipo=evento");
    const exportUrl = await page.getByRole("link", { name: "Exportar calendario", exact: true }).getAttribute("href");
    expect((await page.request.get(exportUrl!)).status()).toBe(200);
  } finally { await f.cleanup(); }
});

test("plazos: validación de fechas, creación manual idempotente y permisos de cierre", async ({ page }) => {
  const f = await fixture(page);
  try {
    for (const bad of [{ fechaLimite: "2026-02-31", diasPlazo: 5 }, { diasPlazo: 1e12 }]) {
      const response = await apiRequest(page).post("/api/plazos", { data: { titulo: "No crear", causaId: f.cause.id, ...bad } });
      expect(response.status()).toBe(400);
    }
    const body = { titulo: "Plazo manual", causaId: f.cause.id, fechaLimite: "2026-11-24" }, key = randomUUID();
    const first = await apiRequest(page).post("/api/plazos", { headers: { "Idempotency-Key": key }, data: body });
    expect(first.status()).toBe(201);
    const deadline = await first.json();
    expect((await (await apiRequest(page).post("/api/plazos", { headers: { "Idempotency-Key": key }, data: body })).json()).id).toBe(deadline.id);
    expect(deadline.fechaLimite).toBe("2026-11-24T00:00:00.000Z");
    await page.goto("/plazos?mes=2026-11");
    await expect(page.getByRole("heading", { name: "Plazo manual", exact: true })).toBeVisible();
    await db.user.update({ where: { id: f.owner.id }, data: { capabilityRevokes: "plazo.edit" } });
    expect((await apiRequest(page).patch("/api/plazos", { data: { id: deadline.id, estado: "cumplido" } })).status()).toBe(403);
    expect((await db.plazo.findUniqueOrThrow({ where: { id: deadline.id } })).estado).toBe("pendiente");
  } finally { await f.cleanup(); }
});


test("agenda espera a sus controles antes de aceptar datos y enviar", async ({ page }) => {
  const f = await fixture(page);
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/_next\/.*\.js(?:\?.*)?$/, async route => { await ready; await route.continue(); });
  try {
    await page.goto("/calendario?ym=2026-11&tipo=evento&nuevo=1", { waitUntil: "commit" });
    const title = page.getByLabel("Título", { exact: true });
    await expect(title).toBeVisible();
    await expect(title).toBeDisabled();
    await expect(page.getByRole("button", { name: "Preparando formulario…", exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole("button", { name: "Crear evento", exact: true })).toBeEnabled();
    await title.fill(f.title);
    await expect(title).toHaveValue(f.title);
    expect(await db.evento.count({ where: { causaId: f.cause.id } })).toBe(0);
  } finally { release(); await page.unrouteAll({ behavior: "ignoreErrors" }); await f.cleanup(); }
});
