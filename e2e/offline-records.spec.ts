import { test as baseTest, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { readFile } from "node:fs/promises";
import { prisma } from "../src/lib/db";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs, authenticateApiRequests, apiRequest } from "./helpers";
import { networkGateway } from "./fixtures/network-gateway";
assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) throw Error("Disposable database required");
const test = baseTest.extend<{ network: Awaited<ReturnType<typeof networkGateway>> }>({
  network: async ({}, provide, info) => { const gateway = await networkGateway(String(info.project.use.baseURL)); try { await provide(gateway); } finally { await gateway.close(); } },
  baseURL: async ({ network }, provide) => provide(network.origin),
});
type Kind = "cliente" | "task";
const key = "fictitious-local-records-key";
const names = { cliente: "Razón social / nombre", task: "Título de la tarea" };
const selectors = { cliente: "Clientes locales", task: "Tareas locales" };
async function fixture(page: Page) {
  const tag = randomUUID();
  const a = await prisma.user.create({ data: { name: "Autor offline ficticio", email: `${tag}@records.invalid`, password: await hash("lexopen", 10), role: "abogado" } });
  const b = await prisma.user.create({ data: { name: "Otra cuenta ficticia", email: `${tag}-b@records.invalid`, password: await hash("lexopen", 10), role: "abogado" } });
  const cause = await prisma.causa.create({ data: { titulo: tag, materia: "civil", tribunal: "Ficticio", acceso: "equipo", abogadoId: a.id } });
  await loginAs(page, a.email); await authenticateApiRequests(page);
  const clientResponse = await apiRequest(page).post("/api/clientes", { data: { razonSocial: `Cliente ${tag}`, telefono: "+15555550100", notas: "Nota original", abogadoId: a.id } }); expect(clientResponse.status()).toBe(201);
  const client = await clientResponse.json();
  const taskResponse = await apiRequest(page).post("/api/tasks", { data: { title: `Tarea ${tag}`, assigneeId: a.id, causaId: cause.id, instructions: "Instrucciones originales", dueDate: "2026-11-12T13:40:10.000Z" } }); expect(taskResponse.status()).toBe(201);
  const task = await taskResponse.json();
  return { a, b, cause, client, task, tag, id: (kind: Kind) => kind === "cliente" ? client.id : task.id,
    url: (kind: Kind) => `/offline.html?kind=${kind}&record=${kind === "cliente" ? client.id : task.id}`,
    cleanup: async () => {
      await prisma.caseWritingDraft.deleteMany({ where: { causaId: cause.id } });
      await prisma.task.deleteMany({ where: { creatorId: { in: [a.id, b.id] } } }); await prisma.causa.delete({ where: { id: cause.id } });
      await prisma.cliente.deleteMany({ where: { OR: [{ abogadoId: a.id }, { id: client.id }] } });
      await prisma.mensajeSaliente.deleteMany({ where: { userId: { in: [a.id, b.id] } } }); await prisma.notification.deleteMany({ where: { userId: { in: [a.id, b.id] } } });
      await prisma.commandExecution.deleteMany({ where: { ownerId: { in: [a.id, b.id] } } }); await prisma.auditEvent.deleteMany({ where: { actorId: { in: [a.id, b.id] } } }); await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    },
  };
}
async function unlock(page: Page) { await page.getByLabel("Clave del espacio local").fill(key); await page.getByRole("button", { name: "Desbloquear", exact: true }).click(); await expect(page.getByRole("navigation", { name: "Áreas del espacio local" })).toBeVisible(); }
async function prepare(page: Page, url: string, kind: Kind) {
  await page.goto(url); await page.getByLabel("Clave del espacio local").fill(key); page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Crear espacio cifrado", exact: true }).click();
  await page.getByRole("button", { name: kind === "cliente" ? "Preparar cliente" : "Preparar tarea", exact: true }).click(); await expect(page.getByLabel(names[kind], { exact: true })).toBeVisible(); await expect(page.locator("#message")).toContainText("Registro preparado");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}
async function edit(page: Page, kind: Kind, value: string) { await page.getByLabel(names[kind], { exact: true }).fill(value); await expect(page.locator("#record-local-state")).toHaveText("Copia local guardada"); }
async function sync(page: Page) { await page.getByRole("button", { name: "Sincronizar registro", exact: true }).click(); }

for (const kind of ["cliente", "task"] as const) {
  test(`${kind}: edición y creación cifradas, recarga sin red y sincronización sin duplicados`, async ({ page, network }, info) => {
    test.setTimeout(120000); const f = await fixture(page);
    try {
      await prepare(page, f.url(kind), kind); const existing = await page.getByLabel(selectors[kind]).inputValue();
      network.setOffline(true); await edit(page, kind, `Edición local ${f.tag}`);
      await page.getByRole("button", { name: kind === "cliente" ? "Nuevo cliente local" : "Nueva tarea local", exact: true }).click();
      await edit(page, kind, `Registro nuevo ${f.tag}`); const localId = await page.getByLabel(selectors[kind]).inputValue();
      if (kind === "cliente") { await page.getByLabel("Correo electrónico", { exact: true }).fill("contacto@fictitious.invalid"); await page.getByLabel("Notas del cliente", { exact: true }).fill("Información confidencial de prueba"); }
      else await page.getByLabel("Descripción", { exact: true }).fill("Información confidencial de prueba");
      await expect(page.locator("#record-local-state")).toHaveText("Copia local guardada");
      const disk = await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open("lexopen-offline-v1"); request.onsuccess = () => resolve(request.result); });
        const row = await new Promise<{ bytes: ArrayBuffer }>(resolve => { const request = db.transaction("vault").objectStore("vault").get("workspace"); request.onsuccess = () => resolve(request.result); }); db.close(); return JSON.stringify(row) + new TextDecoder().decode(row.bytes);
      });
      expect(disk).not.toContain(f.a.id); expect(disk).not.toContain(f.tag); expect(disk).not.toContain("Información confidencial");
      await page.reload(); await unlock(page); await page.getByLabel(selectors[kind]).selectOption(localId); await expect(page.getByLabel(names[kind], { exact: true })).toHaveValue(`Registro nuevo ${f.tag}`);
      await page.setViewportSize({ width: 360, height: 800 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath(`${kind}-mobile.png`), animations: "disabled" });
      await page.setViewportSize({ width: 1440, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath(`${kind}-desktop.png`), animations: "disabled" });
      network.setOffline(false); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado"); await sync(page); await expect(page.locator("#message")).toContainText("no tiene cambios locales pendientes");
      const created = kind === "cliente" ? await prisma.cliente.count({ where: { razonSocial: `Registro nuevo ${f.tag}` } }) : await prisma.task.count({ where: { title: `Registro nuevo ${f.tag}` } }); expect(created).toBe(1);
      await page.getByLabel(selectors[kind]).selectOption(existing); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
      if (kind === "cliente") { const row = await prisma.cliente.findUniqueOrThrow({ where: { id: f.client.id } }); expect(row.razonSocial).toBe(`Edición local ${f.tag}`); expect(row.telefono).toBe("+15555550100"); expect(row.abogadoId).toBe(f.a.id); }
      else { const row = await prisma.task.findUniqueOrThrow({ where: { id: f.task.id } }); expect(row.title).toBe(`Edición local ${f.tag}`); expect(row.causaId).toBe(f.cause.id); expect(row.dueDate?.toISOString()).toBe("2026-11-12T13:40:10.000Z"); expect(row.instructions).toBe("Instrucciones originales"); }
    } finally { network.setOffline(false); await f.cleanup(); }
  });

  test(`${kind}: la respuesta perdida conserva la creación y los cambios escritos después`, async ({ page, network }) => {
    test.setTimeout(120000); const f = await fixture(page);
    try {
      await prepare(page, f.url(kind), kind); await page.getByRole("button", { name: kind === "cliente" ? "Nuevo cliente local" : "Nueva tarea local", exact: true }).click();
      await edit(page, kind, `Primera versión ${f.tag}`); const localId = await page.getByLabel(selectors[kind]).inputValue();
      network.dropNextPost("/api/offline/sync"); await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
      await page.reload(); await unlock(page); await page.getByLabel(selectors[kind]).selectOption(localId); await edit(page, kind, `Versión posterior ${f.tag}`);
      await sync(page); await expect(page.locator("#message")).toContainText("Envío anterior confirmado");
      const bodies = () => network.requests.filter(row => row.path === "/api/offline/sync").map(row => row.body);
      expect(bodies()[1]).toBe(bodies()[0]); expect(JSON.parse(bodies()[0]).action).toBe("create");
      await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
      expect(JSON.parse(bodies()[2]).action).toBe("update"); expect(JSON.parse(bodies()[2]).requestId).not.toBe(JSON.parse(bodies()[0]).requestId);
      const count = kind === "cliente" ? await prisma.cliente.count({ where: { razonSocial: { contains: f.tag } } }) : await prisma.task.count({ where: { title: { contains: f.tag } } }); expect(count).toBe(2);
    } finally { await f.cleanup(); }
  });

  test(`${kind}: un cambio en línea provoca conflicto y conserva la copia local tras recargar`, async ({ page }) => {
    test.setTimeout(120000); const f = await fixture(page);
    try {
      await prepare(page, f.url(kind), kind); await edit(page, kind, `Copia local ${f.tag}`);
      const response = kind === "cliente" ? await apiRequest(page).patch(`/api/clientes/${f.client.id}`, { data: { razonSocial: `Otra sesión ${f.tag}` } }) : await apiRequest(page).patch("/api/tasks", { data: { id: f.task.id, title: `Otra sesión ${f.tag}` } }); expect(response.status()).toBe(200);
      await sync(page); await expect(page.locator("#message")).toContainText("Hay cambios en otra sesión"); await page.reload(); await unlock(page); await expect(page.getByLabel(names[kind], { exact: true })).toHaveValue(`Copia local ${f.tag}`);
      let dismissed = false; page.once("dialog", async dialog => { await dialog.dismiss(); dismissed = true; }); await page.getByRole("button", { name: "Descargar versión del servidor", exact: true }).click(); await expect.poll(() => dismissed).toBe(true); await expect(page.getByRole("button", { name: "Descargar versión del servidor", exact: true })).toBeEnabled(); await expect(page.getByLabel(names[kind], { exact: true })).toHaveValue(`Copia local ${f.tag}`);
      page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Descargar versión del servidor", exact: true }).click(); await expect(page.getByLabel(names[kind], { exact: true })).toHaveValue(`Otra sesión ${f.tag}`);
    } finally { await f.cleanup(); }
  });
}

test("otra cuenta no puede sincronizar y retirar permisos conserva la copia pendiente", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("cliente"), "cliente"); await edit(page, "cliente", `Cambio protegido ${f.tag}`);
    await apiRequest(page).post("/api/auth/logout"); await loginAs(page, f.b.email); await authenticateApiRequests(page); await page.goto(f.url("cliente")); await unlock(page);
    await sync(page); await expect(page.locator("#message")).toContainText("otra cuenta"); expect((await prisma.cliente.findUniqueOrThrow({ where: { id: f.client.id } })).razonSocial).toBe(f.client.razonSocial);
    await apiRequest(page).post("/api/auth/logout"); await loginAs(page, f.a.email); await authenticateApiRequests(page); await page.goto(f.url("cliente")); await unlock(page);
    await prisma.user.update({ where: { id: f.a.id }, data: { role: "cliente" } }); await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
    await expect(page.getByLabel(names.cliente, { exact: true })).toHaveValue(`Cambio protegido ${f.tag}`);
    await prisma.user.update({ where: { id: f.a.id }, data: { role: "abogado" } }); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
  } finally { await f.cleanup(); }
});

test("revocar el expediente bloquea la sincronización de una tarea preparada", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("task"), "task"); await edit(page, "task", `Tarea protegida ${f.tag}`);
    await prisma.causa.update({ where: { id: f.cause.id }, data: { abogadoId: f.b.id } }); await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true"); expect((await prisma.task.findUniqueOrThrow({ where: { id: f.task.id } })).title).toBe(f.task.title);
    await prisma.causa.update({ where: { id: f.cause.id }, data: { abogadoId: f.a.id } }); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
  } finally { await f.cleanup(); }
});

test("la cuota local agotada permite descargar el contacto sin declararlo guardado", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("cliente"), "cliente"); await page.evaluate(() => { IDBObjectStore.prototype.put = () => { throw new DOMException("Fictitious quota", "QuotaExceededError"); }; });
    await page.getByLabel("Notas del cliente", { exact: true }).fill("Datos recuperables tras fallo de disco"); await expect(page.locator("#record-local-state")).toHaveText("Copia local sin guardar · descargue el texto");
    const waiting = page.waitForEvent("download"); await page.getByRole("button", { name: "Descargar copia local", exact: true }).click(); const file = await waiting;
    expect(file.suggestedFilename()).toBe("cliente-local.json"); expect(await readFile((await file.path())!, "utf8")).toContain("Datos recuperables tras fallo de disco");
  } finally { await f.cleanup(); }
});

test("el formulario de Clientes conserva sus datos ante una sincronización posterior de otra sesión", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await page.goto(`/clientes/${f.client.id}`); await page.getByRole("textbox", { name: "Notas", exact: true }).fill("Edición del formulario abierta antes del cambio");
    const snapshot = await (await page.request.get(`/api/offline/entities?kind=cliente&id=${f.client.id}`)).json();
    expect((await apiRequest(page).post("/api/offline/sync", { data: { kind: "cliente", action: "update", requestId: randomUUID(), entityId: f.client.id, expectedVersion: snapshot.version, fields: { razonSocial: f.client.razonSocial, notas: "Cambio sincronizado desde otra sesión" } } })).status()).toBe(200);
    await page.getByRole("button", { name: "Guardar datos", exact: true }).click(); await expect(page.getByText(/El cliente cambió en otra sesión/)).toBeVisible(); await expect(page.getByRole("textbox", { name: "Notas", exact: true })).toHaveValue("Edición del formulario abierta antes del cambio");
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: f.client.id } })).notas).toBe("Cambio sincronizado desde otra sesión");
  } finally { await f.cleanup(); }
});

test("Clientes guarda la edición antes de abrir la copia sin conexión", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await page.goto(`/clientes/${f.client.id}`); await page.getByRole("textbox", { name: "Notas", exact: true }).fill("Nota guardada antes de preparar la copia");
    await page.getByRole("button", { name: "Trabajar sin conexión", exact: true }).click(); await expect(page).toHaveURL(/offline\.html\?kind=cliente/);
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: f.client.id } })).notas).toBe("Nota guardada antes de preparar la copia");
    await page.getByLabel("Clave del espacio local").fill(key); page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Crear espacio cifrado", exact: true }).click();
    await page.getByRole("button", { name: "Preparar cliente", exact: true }).click(); await expect(page.getByLabel("Notas del cliente", { exact: true })).toHaveValue("Nota guardada antes de preparar la copia");
  } finally { await f.cleanup(); }
});

test("una validación rechazada permite corregir el contacto y sincronizar sin duplicarlo", async ({ page, network }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("cliente"), "cliente"); await page.getByRole("button", { name: "Nuevo cliente local", exact: true }).click(); await edit(page, "cliente", `Contacto corregible ${f.tag}`);
    await page.getByLabel("Correo electrónico", { exact: true }).fill("dirección-inválida"); await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
    await page.getByLabel("Correo electrónico", { exact: true }).fill("corregido@fictitious.invalid"); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    const requests = network.requests.filter(row => row.path === "/api/offline/sync"); expect(JSON.parse(requests[0].body).requestId).not.toBe(JSON.parse(requests[1].body).requestId);
    expect(await prisma.cliente.count({ where: { razonSocial: `Contacto corregible ${f.tag}` } })).toBe(1);
  } finally { await f.cleanup(); }
});

test("un espacio anterior conserva los escritos y sus peticiones al añadir Clientes", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    const response = await apiRequest(page).post(`/api/causas/${f.cause.id}/writings`, { data: { requestId: randomUUID(), title: "Escrito anterior", body: "Texto original" } }); expect(response.status()).toBe(201);
    const { draft } = await response.json(), pending = { requestId: randomUUID(), expectedRevision: 1, title: draft.title, body: "Edición heredada aún pendiente" };
    const url = `/offline.html?case=${f.cause.id}&draft=${draft.id}`; await page.goto(url);
    await page.evaluate(async payload => {
      const path = "/offline/vault.js", { openVaultStore } = await import(path), vault = await openVaultStore();
      const data = await vault.create(payload.key, payload.owner);
      data.entries = [{ id: payload.draft.id, causaId: payload.draft.causaId, title: payload.draft.title, body: payload.pending.body, baseTitle: payload.draft.title, baseBody: payload.draft.body, revision: 1, pending: payload.pending }];
      await vault.write(data); vault.lock();
    }, { key, owner: f.a.id, draft, pending });
    await page.reload(); await unlock(page); await expect(page.getByRole("textbox", { name: "Texto del escrito", exact: true })).toHaveValue(pending.body);
    await page.getByRole("button", { name: "Clientes", exact: true }).click(); await page.getByRole("button", { name: "Nuevo cliente local", exact: true }).click(); await edit(page, "cliente", `Cliente heredado ${f.tag}`);
    await page.reload(); await unlock(page); await expect(page.getByRole("textbox", { name: "Texto del escrito", exact: true })).toHaveValue(pending.body);
    await page.getByRole("button", { name: "Sincronizar escrito", exact: true }).click(); await expect(page.locator("#message")).toContainText("Escrito sincronizado");
    expect((await prisma.caseWritingDraft.findUniqueOrThrow({ where: { id: draft.id } })).body).toBe(pending.body);
    await page.getByRole("button", { name: "Clientes", exact: true }).click(); await expect(page.getByLabel(names.cliente, { exact: true })).toHaveValue(`Cliente heredado ${f.tag}`);
  } finally { await f.cleanup(); }
});
