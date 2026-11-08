import { test as baseTest, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/db";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { authenticateApiRequests, loginAs } from "./helpers";
import { networkGateway } from "./fixtures/network-gateway";
assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) throw Error("Disposable database required");
const test = baseTest.extend<{ network: Awaited<ReturnType<typeof networkGateway>> }>({
  network: async ({}, provide, info) => { const gateway = await networkGateway(String(info.project.use.baseURL)); try { await provide(gateway); } finally { await gateway.close(); } },
  baseURL: async ({ network }, provide) => provide(network.origin),
});
const key = "fictional-links-local-password";
type Kind = "cliente" | "task";
async function fixture(page: Page) {
  const tag = randomUUID(), password = await hash("lexopen", 10);
  const a = await prisma.user.create({ data: { name: `Autor ${tag}`, email: `${tag}@links.invalid`, password, role: "abogado" } });
  const b = await prisma.user.create({ data: { name: `Destino ${tag}`, email: `${tag}-b@links.invalid`, password, role: "abogado" } });
  const client = await prisma.cliente.create({ data: { razonSocial: `Cliente ${tag}`, abogadoId: a.id, notas: "Nota original" } });
  const cause = await prisma.causa.create({ data: { titulo: `Origen ${tag}`, tribunal: "Ficticio", materia: "civil", abogadoId: a.id, acceso: "equipo", clienteId: client.id } });
  const next = await prisma.causa.create({ data: { titulo: `Nueva causa ${tag}`, tribunal: "Ficticio", materia: "civil", abogadoId: a.id, acceso: "equipo" } });
  await prisma.causaMiembro.createMany({ data: [cause, next].map(c => ({ causaId: c.id, userId: b.id, rol: "colaborador" })) });
  const hidden = await prisma.causa.create({ data: { titulo: `Reservada ${tag}`, tribunal: "Ficticio", materia: "civil", abogadoId: b.id, acceso: "equipo", clienteId: client.id } });
  await loginAs(page, a.email); await authenticateApiRequests(page);
  const response = await page.request.post("/api/tasks", { data: { title: `Tarea ${tag}`, causaId: cause.id, assigneeId: a.id, clienteId: client.id, dueDate: "2026-11-12T13:40:10.000Z" } });
  expect(response.status()).toBe(201); const task = await response.json();
  return { a, b, client, cause, next, hidden, task, tag,
    url: (kind: Kind) => `/offline.html?kind=${kind}&record=${kind === "cliente" ? client.id : task.id}`,
    cleanup: async () => {
      await prisma.task.deleteMany({ where: { creatorId: a.id } }); await prisma.causa.deleteMany({ where: { id: { in: [cause.id, next.id, hidden.id] } } });
      await prisma.cliente.deleteMany({ where: { OR: [{ id: client.id }, { razonSocial: { contains: tag } }] } });
      await prisma.mensajeSaliente.deleteMany({ where: { userId: { in: [a.id, b.id] } } }); await prisma.notification.deleteMany({ where: { userId: { in: [a.id, b.id] } } });
      await prisma.commandExecution.deleteMany({ where: { ownerId: a.id } }); await prisma.auditEvent.deleteMany({ where: { actorId: a.id } }); await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    },
  };
}
async function unlock(page: Page) { await page.getByLabel("Clave del espacio local").fill(key); await page.getByRole("button", { name: "Desbloquear", exact: true }).click(); await expect(page.getByRole("navigation", { name: "Áreas del espacio local" })).toBeVisible(); }
async function prepare(page: Page, url: string, kind: Kind) {
  await page.goto(url); await page.getByLabel("Clave del espacio local").fill(key); page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "Crear espacio cifrado", exact: true }).click();
  await page.getByRole("button", { name: kind === "cliente" ? "Preparar cliente" : "Preparar tarea", exact: true }).click(); await expect(page.locator("#message")).toContainText("Registro preparado");
  await page.locator("#binding-panel > summary").click();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}
async function saveOption(page: Page, type: string, query: string, label: string) {
  await page.locator("#binding-panel details").evaluate((el: HTMLDetailsElement) => { el.open = true; });
  await page.getByLabel("Tipo de opción", { exact: true }).selectOption(type); await page.getByLabel("Buscar opciones", { exact: true }).fill(query);
  await page.getByRole("button", { name: "Buscar opciones con conexión", exact: true }).click(); await expect(page.locator("#message")).toContainText("Elija qué opciones");
  await page.getByRole("button", { name: `Preparar opción: ${label}`, exact: true }).click(); await expect(page.locator("#message")).toContainText("Opciones locales actualizadas");
}
async function sync(page: Page) { await page.getByRole("button", { name: "Sincronizar registro", exact: true }).click(); }
async function disk(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("lexopen-offline-v1"); r.onsuccess = () => resolve(r.result); });
    const row = await new Promise<{ bytes: ArrayBuffer }>(resolve => { const r = db.transaction("vault").objectStore("vault").get("workspace"); r.onsuccess = () => resolve(r.result); }); db.close(); return JSON.stringify(row) + new TextDecoder().decode(row.bytes);
  });
}

test("Clientes: responsables y vínculos cifrados persisten sin red y conservan las causas ocultas", async ({ page, network }, info) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("cliente"), "cliente"); await saveOption(page, "user", f.tag, f.b.name); await saveOption(page, "cause", f.tag, f.next.titulo);
    await expect(page.locator("#reference-results")).not.toContainText(f.hidden.titulo); await expect(page.locator("#binding-cases")).not.toContainText(f.hidden.titulo);
    network.setOffline(true); await page.getByLabel("Responsable del registro", { exact: true }).selectOption(f.b.id);
    await page.locator("#binding-cases label").filter({ hasText: f.next.titulo }).getByRole("checkbox").check();
    await page.locator("#binding-cases label").filter({ hasText: f.cause.titulo }).getByRole("checkbox").uncheck();
    await page.getByLabel("Notas del cliente", { exact: true }).fill(`Confidencial ${f.tag}`); await expect(page.locator("#record-local-state")).toHaveText("Copia local guardada");
    const encrypted = await disk(page); for (const secret of [f.a.id, f.b.id, f.next.id, f.tag]) expect(encrypted).not.toContain(secret);
    await page.reload(); await unlock(page); await expect(page.getByLabel("Responsable del registro", { exact: true })).toHaveValue(f.b.id);
    await page.locator("#binding-panel").evaluate((el: HTMLDetailsElement) => { el.open = true; });
    await expect(page.locator("#binding-cases label").filter({ hasText: f.next.titulo }).getByRole("checkbox")).toBeChecked();
    for (const [label, width, height] of [["mobile", 360, 800], ["desktop", 1440, 1000]] as const) { await page.setViewportSize({ width, height }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath(`links-${label}.png`), fullPage: true, animations: "disabled" }); }
    network.setOffline(false); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado"); await sync(page); await expect(page.locator("#message")).toContainText("no tiene cambios");
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: f.client.id } })).abogadoId).toBe(f.b.id);
    expect((await prisma.causa.findUniqueOrThrow({ where: { id: f.next.id } })).clienteId).toBe(f.client.id); expect((await prisma.causa.findUniqueOrThrow({ where: { id: f.cause.id } })).clienteId).toBeNull();
    expect((await prisma.causa.findUniqueOrThrow({ where: { id: f.hidden.id } })).clienteId).toBe(f.client.id);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: f.task.id } })).clienteId).toBeNull();
    expect(await prisma.auditEvent.count({ where: { actorId: f.a.id, action: "causa.cliente.link" } })).toBe(2);
  } finally { network.setOffline(false); await f.cleanup(); }
});

for (const kind of ["cliente", "task"] as const) test(`${kind}: respuesta perdida y elecciones posteriores usan dos peticiones sin duplicar`, async ({ page, network }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url(kind), kind); await saveOption(page, "user", f.tag, f.b.name); await saveOption(page, "cause", f.tag, f.next.titulo);
    if (kind === "cliente") { await page.getByRole("button", { name: "Nuevo cliente local", exact: true }).click(); await page.getByLabel("Razón social / nombre", { exact: true }).fill(`Nuevo ${f.tag}`); }
    await page.getByLabel("Responsable del registro", { exact: true }).selectOption(f.b.id);
    if (kind === "task") await page.getByLabel("Causa de la tarea", { exact: true }).selectOption(f.next.id);
    else await page.locator("#binding-cases label").filter({ hasText: f.next.titulo }).getByRole("checkbox").check();
    const localId = await page.locator("#record-picker").inputValue();
    network.dropNextPost("/api/offline/sync"); await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
    await page.getByLabel("Responsable del registro", { exact: true }).selectOption(f.a.id);
    if (kind === "task") await page.getByLabel("Causa de la tarea", { exact: true }).selectOption(f.cause.id);
    else await page.locator("#binding-cases label").filter({ hasText: f.next.titulo }).getByRole("checkbox").uncheck();
    await expect(page.locator("#record-local-state")).toHaveText("Copia local guardada");
    await page.reload(); await unlock(page); await page.locator("#record-picker").selectOption(localId); await sync(page); await expect(page.locator("#message")).toContainText("Envío anterior confirmado");
    const bodies = () => network.requests.filter(r => r.path === "/api/offline/sync").map(r => r.body);
    expect(bodies()[1]).toBe(bodies()[0]); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    expect(JSON.parse(bodies()[2]).requestId).not.toBe(JSON.parse(bodies()[0]).requestId);
    if (kind === "task") { const row = await prisma.task.findUniqueOrThrow({ where: { id: f.task.id } }); expect(row.causaId).toBe(f.cause.id); expect(row.assigneeId).toBe(f.a.id); expect(row.dueDate?.toISOString()).toBe("2026-11-12T13:40:10.000Z"); }
    else { const rows = await prisma.cliente.findMany({ where: { razonSocial: `Nuevo ${f.tag}` } }); expect(rows).toHaveLength(1); expect(rows[0].abogadoId).toBe(f.a.id); expect((await prisma.causa.findUniqueOrThrow({ where: { id: f.next.id } })).clienteId).toBeNull(); }
  } finally { await f.cleanup(); }
});

test("referencia obsoleta exige revisión explícita y conserva los campos locales", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("task"), "task"); await saveOption(page, "user", f.tag, f.b.name); await page.getByLabel("Responsable del registro", { exact: true }).selectOption(f.b.id);
    await page.getByLabel("Descripción", { exact: true }).fill("Texto que debe conservarse"); await prisma.user.update({ where: { id: f.b.id }, data: { name: `Renombrado ${f.tag}` } });
    await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true"); expect((await prisma.task.findUniqueOrThrow({ where: { id: f.task.id } })).description).toBeNull();
    await page.reload(); await unlock(page); await page.locator("#binding-panel").evaluate((el: HTMLDetailsElement) => { el.open = true; });
    await page.getByRole("button", { name: "Revisar referencias rechazadas", exact: true }).click(); await expect(page.locator("#binding-review-list")).toContainText(`Renombrado ${f.tag}`);
    await expect(page.getByLabel("Descripción", { exact: true })).toHaveValue("Texto que debe conservarse"); await page.getByRole("button", { name: "Confirmar referencias revisadas", exact: true }).click();
    await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado"); const row = await prisma.task.findUniqueOrThrow({ where: { id: f.task.id } }); expect(row.description).toBe("Texto que debe conservarse"); expect(row.assigneeId).toBe(f.b.id);
  } finally { await f.cleanup(); }
});

test("completar y mover una tarea recurrente conserva los nuevos vínculos en un único sucesor", async ({ page, network }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prisma.task.update({ where: { id: f.task.id }, data: { rrule: "FREQ=DAILY" } });
    await prepare(page, f.url("task"), "task"); await saveOption(page, "user", f.tag, f.b.name); await saveOption(page, "cause", f.tag, f.next.titulo);
    await page.getByLabel("Responsable del registro", { exact: true }).selectOption(f.b.id); await page.getByLabel("Causa de la tarea", { exact: true }).selectOption(f.next.id);
    await page.getByLabel("Instrucciones", { exact: true }).fill("Nueva instrucción de la serie"); await page.getByLabel("Estado de la tarea", { exact: true }).selectOption("done");
    network.dropNextPost("/api/offline/sync"); await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
    await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    const rows = await prisma.task.findMany({ where: { creatorId: f.a.id, title: f.task.title, id: { not: f.task.id } } }); expect(rows).toHaveLength(1);
    expect(rows[0].assigneeId).toBe(f.b.id); expect(rows[0].causaId).toBe(f.next.id); expect(rows[0].clienteId).toBeNull(); expect(rows[0].instructions).toBe("Nueva instrucción de la serie");
    expect(rows[0].dueDate?.toISOString()).toBe("2026-11-13T13:40:10.000Z");
  } finally { await f.cleanup(); }
});

test("revocar la causa de destino impide mover y permite conservar sólo la edición válida", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("task"), "task"); await saveOption(page, "cause", f.tag, f.next.titulo); await page.getByLabel("Causa de la tarea", { exact: true }).selectOption(f.next.id); await page.getByLabel("Descripción", { exact: true }).fill("Conservar descripción");
    await prisma.causa.update({ where: { id: f.next.id }, data: { abogadoId: f.b.id } }); await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
    expect((await prisma.task.findUniqueOrThrow({ where: { id: f.task.id } })).causaId).toBe(f.cause.id);
    await page.getByRole("button", { name: "Deshacer elecciones de vínculos", exact: true }).click(); await page.getByRole("button", { name: "Revisar referencias rechazadas", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar referencias revisadas", exact: true }).click(); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    const row = await prisma.task.findUniqueOrThrow({ where: { id: f.task.id } }); expect(row.causaId).toBe(f.cause.id); expect(row.description).toBe("Conservar descripción");
  } finally { await f.cleanup(); }
});

test("una copia anterior añade referencias sin reemplazar campos ni peticiones pendientes", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("task"), "task");
    await page.evaluate(async password => {
      const modulePath = "/offline/vault.js"; const { openVaultStore } = await import(modulePath); const vault = await openVaultStore(); const data = await vault.unlock(password);
      const item = data.records[0]; delete item.baseRelations; delete item.relationChoices; item.fields.description = "Edición anterior protegida";
      item.pending = { kind: "task", action: "update", requestId: crypto.randomUUID(), entityId: item.remoteId, expectedVersion: item.version, fields: structuredClone(item.fields) };
      await vault.write(data); vault.lock();
    }, key);
    await page.reload(); await unlock(page); await page.locator("#binding-panel").evaluate((el: HTMLDetailsElement) => { el.open = true; });
    await expect(page.getByLabel("Responsable del registro", { exact: true })).toBeDisabled(); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    await expect(page.getByLabel("Descripción", { exact: true })).toHaveValue("Edición anterior protegida");
    await saveOption(page, "user", f.tag, f.b.name); await page.getByLabel("Responsable del registro", { exact: true }).selectOption(f.b.id); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    const row = await prisma.task.findUniqueOrThrow({ where: { id: f.task.id } }); expect(row.description).toBe("Edición anterior protegida"); expect(row.assigneeId).toBe(f.b.id);
  } finally { await f.cleanup(); }
});

test("bloquear durante un guardado conserva el cifrado y la copia anterior", async ({ page }) => {
  await page.goto("/offline.html");
  const result = await page.evaluate(async () => {
    const modulePath = "/offline/vault.js"; const { openVaultStore } = await import(modulePath); const vault = await openVaultStore();
    const data = await vault.create("fictional-vault-lock-password", "fictitious-owner"); data.records = [{ kind: "cliente", fields: { razonSocial: "Copia anterior" } }]; await vault.write(data);
    const original = IDBObjectStore.prototype.get; let armed = true;
    IDBObjectStore.prototype.get = function (...args) { const request = original.apply(this, args); if (armed) request.addEventListener("success", () => { armed = false; vault.lock(); }, { once: true }); return request; };
    let rejected = false; try { await vault.write({ ...data, records: [{ kind: "cliente", fields: { razonSocial: "No debe reemplazar" } }] }); } catch { rejected = true; } finally { IDBObjectStore.prototype.get = original; }
    const recovered = await vault.unlock("fictional-vault-lock-password"); vault.lock(); return { rejected, title: recovered.records[0].fields.razonSocial };
  });
  expect(result).toEqual({ rejected: true, title: "Copia anterior" }); expect(await disk(page)).not.toContain("Copia anterior");
});
