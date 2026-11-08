import { test as baseTest, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/db";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs, authenticateApiRequests, apiRequest } from "./helpers";
import { networkGateway } from "./fixtures/network-gateway";
assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) throw Error("Disposable database required");
const test = baseTest.extend<{ network: Awaited<ReturnType<typeof networkGateway>> }>({
  network: async ({}, provide, info) => { const n = await networkGateway(String(info.project.use.baseURL)); try { await provide(n); } finally { await n.close(); } },
  baseURL: async ({ network }, provide) => provide(network.origin),
});
const key = "fictional-legal-offline-password";
type Kind = "causa" | "plazo";
async function fixture(page: Page) {
  const tag = randomUUID(), password = await hash("lexopen", 10);
  const a = await prisma.user.create({ data: { name: `Autor ${tag}`, email: `${tag}@offline-legal.invalid`, password, role: "abogado" } });
  const b = await prisma.user.create({ data: { name: `Otra cuenta ${tag}`, email: `${tag}-b@offline-legal.invalid`, password, role: "abogado" } });
  const cause = await prisma.causa.create({ data: { titulo: `Causa ${tag}`, rit: `L-${tag}`, tribunal: "Órgano ficticio", materia: "civil", acceso: "equipo", abogadoId: a.id, partes: { create: { nombre: `Parte ${tag}`, rol: "demandante" } } } });
  const deadline = await prisma.plazo.create({ data: { titulo: `Plazo ${tag}`, causaId: cause.id, responsableId: a.id, fechaLimite: new Date("2026-11-20T00:00:00.000Z"), diasPlazo: 5, calculationCountry: "CL", calculationRegime: "internal_weekdays_cl_v1" } });
  await loginAs(page, a.email); await authenticateApiRequests(page);
  return { a, b, cause, deadline, tag, url: (kind: Kind) => `/offline.html?kind=${kind}&record=${kind === "causa" ? cause.id : deadline.id}`,
    cleanup: async () => {
      await prisma.task.deleteMany({ where: { creatorId: a.id } }); await prisma.plazo.deleteMany({ where: { responsableId: a.id } });
      await prisma.causa.deleteMany({ where: { abogadoId: { in: [a.id, b.id] } } }); await prisma.commandExecution.deleteMany({ where: { ownerId: a.id } }); await prisma.auditEvent.deleteMany({ where: { actorId: a.id } }); await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    },
  };
}
async function unlock(page: Page) { await page.getByLabel("Clave del espacio local").fill(key); await page.getByRole("button", { name: "Desbloquear", exact: true }).click(); await expect(page.getByRole("navigation", { name: "Áreas del espacio local" })).toBeVisible(); }
async function prepare(page: Page, url: string, kind: Kind) {
  await page.goto(url); await page.getByLabel("Clave del espacio local").fill(key); page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "Crear espacio cifrado", exact: true }).click();
  await page.getByRole("button", { name: `Preparar ${kind}`, exact: true }).click(); await expect(page.locator("#message")).toContainText("Registro preparado");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}
async function sync(page: Page) { const button = page.getByRole("button", { name: "Sincronizar registro", exact: true }); await button.click(); await expect(button).toBeEnabled({ timeout: 40000 }); }
async function saved(page: Page) { await expect(page.locator("#record-local-state")).toHaveText("Copia local guardada"); }
test("causas: partes y ficha cifradas, recarga sin red y una única etapa al reintentar", async ({ page, network }, info) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("causa"), "causa"); network.setOffline(true); await page.getByLabel("Resumen de la causa", { exact: true }).fill(`Texto reservado ${f.tag}`); await page.getByLabel("Etapa de la causa", { exact: true }).fill("prueba");
    await page.getByRole("button", { name: "Añadir parte", exact: true }).click(); await page.getByLabel("Nombre de la parte", { exact: true }).last().fill(`Otra parte ${f.tag}`); await saved(page);
    const disk = await page.evaluate(async () => { const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("lexopen-offline-v1"); r.onsuccess = () => resolve(r.result); }); const row = await new Promise<{ bytes: ArrayBuffer }>(resolve => { const r = db.transaction("vault").objectStore("vault").get("workspace"); r.onsuccess = () => resolve(r.result); }); db.close(); return JSON.stringify(row) + new TextDecoder().decode(row.bytes); });
    expect(disk).not.toContain(f.tag); expect(disk).not.toContain(f.cause.id); await page.reload(); await unlock(page); await expect(page.getByLabel("Resumen de la causa", { exact: true })).toHaveValue(`Texto reservado ${f.tag}`); await expect(page.getByLabel("Nombre de la parte", { exact: true })).toHaveCount(2);
    for (const [label, width, height] of [["mobile", 360, 800], ["desktop", 1440, 1000]] as const) { await page.setViewportSize({ width, height }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath(`legal-${label}.png`), fullPage: true, animations: "disabled" }); }
    network.setOffline(false); network.dropNextPost("/api/offline/sync"); await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true"); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    expect(await prisma.etapaHistorial.count({ where: { causaId: f.cause.id, etapa: "prueba" } })).toBe(1); expect(await prisma.parte.count({ where: { causaId: f.cause.id } })).toBe(2);
    await page.getByRole("button", { name: "Bloquear espacio", exact: true }).click(); await expect(page.locator("#party-list input")).toHaveCount(0);
  } finally { network.setOffline(false); await f.cleanup(); }
});
test("plazos: fecha civil revisada, procedencia manual y copia conservada después de un rechazo", async ({ page, network }, info) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("plazo"), "plazo"); await expect(page.getByLabel("Fecha límite revisada", { exact: true })).toHaveValue("2026-11-20");
    network.setOffline(true); await page.getByLabel("Descripción del plazo", { exact: true }).fill("Edición manual conservada"); await page.getByLabel("Fecha límite revisada", { exact: true }).fill("2026-11-23"); await saved(page); await page.reload(); await unlock(page);
    for (const [label, width, height] of [["mobile", 360, 800], ["desktop", 1440, 1000]] as const) { await page.setViewportSize({ width, height }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath(`deadline-${label}.png`), fullPage: true, animations: "disabled" }); }
    await expect(page.locator("#deadline-date-readback")).toContainText("23 de noviembre de 2026");
    network.setOffline(false); await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true"); expect((await prisma.plazo.findUniqueOrThrow({ where: { id: f.deadline.id } })).fechaLimite.toISOString()).toBe("2026-11-20T00:00:00.000Z");
    await page.getByLabel("He revisado la fecha límite", { exact: false }).check(); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    const row = await prisma.plazo.findUniqueOrThrow({ where: { id: f.deadline.id } }); expect(row.fechaLimite.toISOString()).toBe("2026-11-23T00:00:00.000Z"); expect(row.calculationCountry).toBeNull(); expect(row.diasPlazo).toBeNull(); expect(row.descripcion).toBe("Edición manual conservada");
  } finally { network.setOffline(false); await f.cleanup(); }
});
test("causa y plazo nuevos: dependencia local, respuesta perdida y cambios posteriores sin duplicación", async ({ page, network }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("causa"), "causa"); await page.getByRole("button", { name: "Nueva causa local", exact: true }).click(); await expect(page.getByLabel("Título de la causa", { exact: true })).toHaveValue(""); const localCause = await page.locator("#record-picker").inputValue();
    network.setOffline(true); await page.getByLabel("Título de la causa", { exact: true }).fill(`Nueva causa ${f.tag}`); await page.getByLabel("Tribunal u órgano", { exact: true }).fill("Órgano local ficticio"); await page.getByLabel("RIT / ROL", { exact: true }).fill(`N-${f.tag}`);
    await page.getByRole("button", { name: "Plazos", exact: true }).click(); await page.getByRole("button", { name: "Nuevo plazo local", exact: true }).click(); await expect(page.getByLabel("Título del plazo", { exact: true })).toHaveValue(""); const localDeadline = await page.locator("#record-picker").inputValue();
    await page.getByLabel("Título del plazo", { exact: true }).fill(`Nuevo plazo ${f.tag}`); await page.getByLabel("Fecha límite revisada", { exact: true }).fill("2026-12-02"); await page.getByLabel("He revisado la fecha límite", { exact: false }).check(); await page.locator("#binding-panel > summary").click(); await page.getByLabel("Causa del plazo", { exact: true }).selectOption("local:" + localCause); await saved(page);
    await page.reload(); await unlock(page); await page.getByRole("button", { name: "Plazos", exact: true }).click(); await page.locator("#record-picker").selectOption(localDeadline); network.setOffline(false); await sync(page); await expect(page.locator("#message")).toContainText("Sincronice primero la causa local");
    await page.getByRole("button", { name: "Causas", exact: true }).click(); await page.locator("#record-picker").selectOption(localCause); network.dropNextPost("/api/offline/sync"); await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
    await page.getByLabel("Resumen de la causa", { exact: true }).fill("Nota posterior al envío perdido"); await sync(page); await expect(page.locator("#message")).toContainText("Envío anterior confirmado");
    await page.getByRole("button", { name: "Plazos", exact: true }).click(); await page.locator("#record-picker").selectOption(localDeadline); await sync(page); await expect(page.locator("#message")).toContainText("Sincronice primero la causa local");
    await page.getByRole("button", { name: "Causas", exact: true }).click(); await page.locator("#record-picker").selectOption(localCause); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    await page.getByRole("button", { name: "Plazos", exact: true }).click(); await page.locator("#record-picker").selectOption(localDeadline); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    const cases = await prisma.causa.findMany({ where: { rit: `N-${f.tag}` } }); expect(cases).toHaveLength(1); expect(cases[0].resumen).toBe("Nota posterior al envío perdido");
    const deadlines = await prisma.plazo.findMany({ where: { titulo: `Nuevo plazo ${f.tag}` } }); expect(deadlines).toHaveLength(1); expect(deadlines[0].causaId).toBe(cases[0].id);
  } finally { network.setOffline(false); await f.cleanup(); }
});
test("la ficha en línea no sobrescribe un cambio sincronizado después de abrir el formulario", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    const snapshot = await (await page.request.get(`/api/offline/entities?kind=causa&id=${f.cause.id}`)).json(); await page.goto(`/causas/${f.cause.id}/editar`); await page.getByLabel("Resumen", { exact: true }).fill("Edición abierta anteriormente");
    const response = await apiRequest(page).post("/api/offline/sync", { data: { kind: "causa", action: "update", requestId: randomUUID(), entityId: f.cause.id, expectedVersion: snapshot.version, fields: { ...snapshot.fields, resumen: "Cambio sincronizado" } } }); expect(response.status()).toBe(200);
    await page.getByRole("button", { name: "Guardar cambios", exact: true }).click(); await expect(page.getByText(/La causa cambió en otra sesión/)).toBeVisible(); await expect(page.getByLabel("Resumen", { exact: true })).toHaveValue("Edición abierta anteriormente"); expect((await prisma.causa.findUniqueOrThrow({ where: { id: f.cause.id } })).resumen).toBe("Cambio sincronizado");
  } finally { await f.cleanup(); }
});
test("retirar permiso de cierre conserva el plazo y rechaza la identidad anterior aun al restaurarlo", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("plazo"), "plazo"); await page.getByLabel("Estado del plazo", { exact: true }).selectOption("cumplido"); await prisma.user.update({ where: { id: f.a.id }, data: { capabilityRevokes: "plazo.close" } });
    await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true"); expect((await prisma.plazo.findUniqueOrThrow({ where: { id: f.deadline.id } })).estado).toBe("pendiente");
    await prisma.user.update({ where: { id: f.a.id }, data: { capabilityRevokes: "" } }); await page.reload(); await unlock(page); await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
    await page.locator("#binding-panel > summary").click(); await page.getByRole("button", { name: "Revisar referencias rechazadas", exact: true }).click(); await page.getByRole("button", { name: "Confirmar referencias revisadas", exact: true }).click(); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    expect((await prisma.plazo.findUniqueOrThrow({ where: { id: f.deadline.id } })).estado).toBe("cumplido"); expect(await prisma.auditEvent.count({ where: { actorId: f.a.id, action: "plazo.update", entityId: f.deadline.id } })).toBe(1);
  } finally { await f.cleanup(); }
});
test("los plazos derivados conservan sus datos de origen y permiten actualizar el estado", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prisma.task.create({ data: { title: "Tarea de origen", plazoId: f.deadline.id, causaId: f.cause.id, creatorId: f.a.id, assigneeId: f.a.id } }); await prepare(page, f.url("plazo"), "plazo");
    await expect(page.getByLabel("Título del plazo", { exact: true })).toBeDisabled(); await expect(page.getByLabel("Fecha límite revisada", { exact: true })).toBeDisabled();
    await page.getByLabel("Estado del plazo", { exact: true }).selectOption("suspendido"); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    const row = await prisma.plazo.findUniqueOrThrow({ where: { id: f.deadline.id } }); expect(row.estado).toBe("suspendido"); expect(row.calculationCountry).toBe("CL"); expect(row.fechaLimite.toISOString()).toBe("2026-11-20T00:00:00.000Z");
  } finally { await f.cleanup(); }
});
