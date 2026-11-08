import { test as baseTest, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/db";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs, authenticateApiRequests } from "./helpers";
import { networkGateway } from "./fixtures/network-gateway";
assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) throw Error("Disposable database required");
const test = baseTest.extend<{ network: Awaited<ReturnType<typeof networkGateway>> }>({
  network: async ({}, provide, info) => { const n = await networkGateway(String(info.project.use.baseURL)); try { await provide(n); } finally { await n.close(); } },
  baseURL: async ({ network }, provide) => provide(network.origin),
});
type Kind = "nota" | "minuta";
const key = "fictional-memos-offline-password";
const title = (kind: Kind) => kind === "nota" ? "Título de la nota" : "Título de la minuta";
const body = (kind: Kind) => kind === "nota" ? "Contenido de la nota" : "Resumen ejecutivo";
async function fixture(page: Page) {
  const tag = randomUUID(), password = await hash("lexopen", 10);
  const a = await prisma.user.create({ data: { name: `Autor ${tag}`, email: `${tag}@offline-memos.invalid`, password, role: "abogado" } });
  const b = await prisma.user.create({ data: { name: `Otra cuenta ${tag}`, email: `${tag}-b@offline-memos.invalid`, password, role: "asistente" } });
  const cause = await prisma.causa.create({ data: { titulo: `Causa ${tag}`, tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: a.id } });
  await prisma.causaMiembro.create({ data: { causaId: cause.id, userId: b.id, rol: "colaborador" } });
  const note = await prisma.nota.create({ data: { titulo: `Nota ${tag}`, contenido: "Contenido original", causaId: cause.id } });
  await loginAs(page, a.email); await authenticateApiRequests(page);
  const response = await page.request.post("/api/minutas", { data: { causaId: cause.id, titulo: `Minuta ${tag}`, resumenEjecutivo: "Resumen original", acciones: [{ descripcion: "Seguimiento original", responsable: a.name, fechaLimite: "2026-11-20", crearTask: true, crearPlazo: true, tipoComputo: "corridos", esFatal: true }] } }); expect(response.status()).toBe(201);
  const minute = (await response.json()).minuta;
  return { a, b, cause, note, minute, tag, id: (kind: Kind) => kind === "nota" ? note.id : minute.id, url: (kind: Kind) => `/offline.html?kind=${kind}&record=${kind === "nota" ? note.id : minute.id}`,
    cleanup: async () => {
      await prisma.mensajeSaliente.deleteMany({ where: { userId: { in: [a.id, b.id] } } }); await prisma.notification.deleteMany({ where: { userId: { in: [a.id, b.id] } } });
      await prisma.task.deleteMany({ where: { creatorId: a.id } }); await prisma.causa.deleteMany({ where: { abogadoId: a.id } }); await prisma.commandExecution.deleteMany({ where: { ownerId: { in: [a.id, b.id] } } }); await prisma.auditEvent.deleteMany({ where: { actorId: { in: [a.id, b.id] } } }); await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
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
async function forceNextId(page: Page, id: string) { await page.evaluate(value => { const original = crypto.randomUUID.bind(crypto); let used = false; Object.defineProperty(crypto, "randomUUID", { configurable: true, value: () => { if (!used) { used = true; return value; } return original(); } }); }, id); }
for (const kind of ["nota", "minuta"] as const) {
  test(`${kind}: copia cifrada, recarga sin red y edición sin duplicados`, async ({ page, network }) => {
    test.setTimeout(120000); const f = await fixture(page);
    try {
      await prepare(page, f.url(kind), kind); network.setOffline(true); await page.getByLabel(body(kind), { exact: true }).fill(`Contenido reservado ${f.tag}`); await saved(page);
      const disk = await page.evaluate(async () => { const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("lexopen-offline-v1"); r.onsuccess = () => resolve(r.result); }); const row = await new Promise<{ bytes: ArrayBuffer }>(resolve => { const r = db.transaction("vault").objectStore("vault").get("workspace"); r.onsuccess = () => resolve(r.result); }); db.close(); return JSON.stringify(row) + new TextDecoder().decode(row.bytes); }); expect(disk).not.toContain(f.tag); expect(disk).not.toContain(f.id(kind));
      await page.reload(); await unlock(page); await expect(page.getByLabel(body(kind), { exact: true })).toHaveValue(`Contenido reservado ${f.tag}`); network.setOffline(false); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
      await sync(page); await expect(page.locator("#message")).toContainText("no tiene cambios");
      if (kind === "nota") expect((await prisma.nota.findUniqueOrThrow({ where: { id: f.note.id } })).contenido).toBe(`Contenido reservado ${f.tag}`);
      else { const m = await prisma.minuta.findUniqueOrThrow({ where: { id: f.minute.id }, include: { documento: true, acciones: true } }); expect(m.documento!.contenido).toContain(`Contenido reservado ${f.tag}`); expect(m.acciones).toHaveLength(1); expect(await prisma.task.count({ where: { creatorId: f.a.id } })).toBe(1); }
    } finally { network.setOffline(false); await f.cleanup(); }
  });
  test(`${kind}: creación con respuesta perdida y ediciones posteriores conserva una sola identidad`, async ({ page, network }, info) => {
    test.setTimeout(120000); const f = await fixture(page);
    try {
      await prepare(page, f.url(kind), kind); await page.getByRole("button", { name: `Nueva ${kind} local`, exact: true }).click(); await expect(page.getByLabel(title(kind), { exact: true })).toHaveValue(""); const localId = await page.locator("#record-picker").inputValue();
      await page.getByLabel(title(kind), { exact: true }).fill(`Nueva ${kind} ${f.tag}`); await page.getByLabel(body(kind), { exact: true }).fill("Primera versión"); await page.locator("#binding-panel > summary").click(); await page.getByLabel(`Causa de la ${kind}`, { exact: true }).selectOption(f.cause.id);
      if (kind === "minuta") { await page.locator("#memo-actions > summary").click(); await forceNextId(page, "ffffffff-ffff-4fff-8fff-fffffffffff1"); await page.getByRole("button", { name: "Añadir acción", exact: true }).click(); await page.getByLabel("Descripción de la acción", { exact: true }).fill("Primera acción"); }
      network.dropNextPost("/api/offline/sync"); await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
      if (kind === "minuta") { await expect(page.getByRole("button", { name: "Quitar acción sin enviar", exact: true })).toBeDisabled(); await expect(page.getByLabel("Seguimiento como tarea", { exact: true }).locator('option[value="false"]')).toBeDisabled(); }
      await page.getByLabel(body(kind), { exact: true }).fill("Edición posterior conservada");
      if (kind === "minuta") { await page.getByLabel("Descripción de la acción", { exact: true }).fill("Primera acción corregida"); await forceNextId(page, "00000000-0000-4000-8000-000000000002"); await page.getByRole("button", { name: "Añadir acción", exact: true }).click(); await page.getByLabel("Descripción de la acción", { exact: true }).last().fill("Segunda acción en orden"); }
      await saved(page); await page.reload(); await unlock(page); await page.locator("#record-picker").selectOption(localId);
      await sync(page); await expect(page.locator("#message")).toContainText("Envío anterior confirmado"); const requests = () => network.requests.filter(r => r.path === "/api/offline/sync").map(r => r.body); expect(requests()[1]).toBe(requests()[0]);
      await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado"); expect(JSON.parse(requests()[2]).requestId).not.toBe(JSON.parse(requests()[0]).requestId);
      if (kind === "nota") { const rows = await prisma.nota.findMany({ where: { titulo: `Nueva nota ${f.tag}` } }); expect(rows).toHaveLength(1); expect(rows[0].contenido).toBe("Edición posterior conservada"); }
      else {
        const rows = await prisma.minuta.findMany({ where: { titulo: `Nueva minuta ${f.tag}` }, include: { documento: true, acciones: { orderBy: { orden: "asc" } } } }); expect(rows).toHaveLength(1); expect(rows[0].resumenEjecutivo).toBe("Edición posterior conservada"); expect(rows[0].acciones.map(a => a.descripcion)).toEqual(["Primera acción corregida", "Segunda acción en orden"]); expect(await prisma.task.count({ where: { creatorId: f.a.id } })).toBe(3);
        await page.locator("#memo-actions").evaluate((el: HTMLDetailsElement) => { el.open = true; });
        for (const [label, width, height] of [["mobile", 360, 800], ["desktop", 1440, 1000]] as const) { await page.setViewportSize({ width, height }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.locator("#memo-actions").screenshot({ path: info.outputPath(`actions-${label}.png`), animations: "disabled" }); }
        await page.getByRole("button", { name: "Bloquear espacio", exact: true }).click(); await expect(page.locator("#memo-action-list textarea")).toHaveCount(0);
      }
    } finally { await f.cleanup(); }
  });
}
test("notas y minutas esperan todos los cambios de su causa local antes de sincronizar", async ({ page, network }) => {
  test.setTimeout(120000); const f = await fixture(page), locals = new Map<Kind, string>();
  try {
    await prepare(page, f.url("nota"), "nota"); network.setOffline(true);
    await page.getByRole("button", { name: "Causas", exact: true }).click(); await page.getByRole("button", { name: "Nueva causa local", exact: true }).click(); await expect(page.getByLabel("Título de la causa", { exact: true })).toHaveValue(""); const causeLocalId = await page.locator("#record-picker").inputValue();
    await page.getByLabel("Título de la causa", { exact: true }).fill(`Dependencia ${f.tag}`); await page.getByLabel("Tribunal u órgano", { exact: true }).fill("Órgano local ficticio");
    for (const kind of ["nota", "minuta"] as const) {
      await page.getByRole("button", { name: kind === "nota" ? "Notas" : "Minutas", exact: true }).click(); await page.getByRole("button", { name: `Nueva ${kind} local`, exact: true }).click(); await expect(page.getByLabel(title(kind), { exact: true })).toHaveValue(""); locals.set(kind, await page.locator("#record-picker").inputValue());
      await page.getByLabel(title(kind), { exact: true }).fill(`Dependiente ${kind} ${f.tag}`); await page.getByLabel(body(kind), { exact: true }).fill("Cambios reservados de la copia local"); await page.locator("#binding-panel").evaluate((el: HTMLDetailsElement) => { el.open = true; }); await page.getByLabel(`Causa de la ${kind}`, { exact: true }).selectOption(`local:${causeLocalId}`);
    }
    await saved(page); await page.reload(); await unlock(page); await page.getByRole("button", { name: "Minutas", exact: true }).click(); await page.locator("#record-picker").selectOption(locals.get("minuta")!); network.setOffline(false); await sync(page); await expect(page.locator("#message")).toContainText("Sincronice primero la causa local");
    await page.getByRole("button", { name: "Causas", exact: true }).click(); await page.locator("#record-picker").selectOption(causeLocalId); network.dropNextPost("/api/offline/sync"); await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
    await page.getByLabel("Resumen de la causa", { exact: true }).fill("Cambio posterior a la respuesta perdida"); await sync(page); await expect(page.locator("#message")).toContainText("Envío anterior confirmado");
    for (const kind of ["nota", "minuta"] as const) { await page.getByRole("button", { name: kind === "nota" ? "Notas" : "Minutas", exact: true }).click(); await page.locator("#record-picker").selectOption(locals.get(kind)!); await sync(page); await expect(page.locator("#message")).toContainText("Sincronice primero la causa local"); }
    await page.getByRole("button", { name: "Causas", exact: true }).click(); await page.locator("#record-picker").selectOption(causeLocalId); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    for (const kind of ["nota", "minuta"] as const) { await page.getByRole("button", { name: kind === "nota" ? "Notas" : "Minutas", exact: true }).click(); await page.locator("#record-picker").selectOption(locals.get(kind)!); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado"); }
    const causes = await prisma.causa.findMany({ where: { titulo: `Dependencia ${f.tag}` } }); expect(causes).toHaveLength(1); expect(causes[0].resumen).toBe("Cambio posterior a la respuesta perdida");
    expect(await prisma.nota.count({ where: { causaId: causes[0].id } })).toBe(1); expect(await prisma.minuta.count({ where: { causaId: causes[0].id } })).toBe(1);
    expect(network.requests.filter(r => r.path === "/api/offline/sync").some(r => r.body.includes('"id":"local:'))).toBe(false);
  } finally { network.setOffline(false); await f.cleanup(); }
});
test("minutas: fecha revisada, cambio de estado y un único seguimiento", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("minuta"), "minuta"); await page.locator("#memo-actions > summary").click(); await page.getByLabel("Fecha de la acción", { exact: true }).fill("2026-11-24"); await page.getByLabel("Estado de la acción", { exact: true }).selectOption("hecha");
    await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true"); await page.getByLabel("He revisado la fecha de esta acción", { exact: false }).check(); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    const m = await prisma.minuta.findUniqueOrThrow({ where: { id: f.minute.id }, include: { acciones: { include: { task: true, plazo: true } } } }); expect(m.acciones[0].task!.status).toBe("done"); expect(m.acciones[0].plazo!.estado).toBe("cumplido"); expect(m.acciones[0].plazo!.fechaLimite.toISOString()).toBe("2026-11-24T00:00:00.000Z"); expect(m.acciones[0].plazo!.esFatal).toBe(true); expect(m.acciones[0].plazo!.tipoComputo).toBe("corridos");
    await sync(page); await expect(page.locator("#message")).toContainText("no tiene cambios"); expect(await prisma.task.count({ where: { creatorId: f.a.id } })).toBe(1);
    await page.goto(`/causas/${f.cause.id}/minutas/${f.minute.id}`); await expect(page.getByText(/plazo 2026-11-24 · hecha/).filter({ visible: true })).toBeVisible();
  } finally { await f.cleanup(); }
});
test("minutas: otra sesión cambia el documento y el conflicto conserva el texto local", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("minuta"), "minuta"); await page.getByLabel("Resumen ejecutivo", { exact: true }).fill("Texto local pendiente");
    expect((await page.request.patch(`/api/minutas/${f.minute.id}`, { data: { titulo: "Edición desde otra sesión" } })).status()).toBe(200); await sync(page); await expect(page.locator("#message")).toContainText("Hay cambios");
    await page.reload(); await unlock(page); await expect(page.getByLabel("Resumen ejecutivo", { exact: true })).toHaveValue("Texto local pendiente");
    const m = await prisma.minuta.findUniqueOrThrow({ where: { id: f.minute.id }, include: { documento: true } }); expect(m.titulo).toBe("Edición desde otra sesión"); expect(m.documento!.contenido).toContain("Edición desde otra sesión"); expect(m.documento!.contenido).not.toContain("Texto local pendiente");
  } finally { await f.cleanup(); }
});
test("minutas: retirar permiso de cierre conserva la petición y exige revisión explícita", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("minuta"), "minuta"); await page.locator("#memo-actions > summary").click(); await page.getByLabel("Estado de la acción", { exact: true }).selectOption("hecha"); await prisma.user.update({ where: { id: f.a.id }, data: { capabilityRevokes: "plazo.close" } });
    await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true"); await prisma.user.update({ where: { id: f.a.id }, data: { capabilityRevokes: "" } });
    await page.reload(); await unlock(page); await sync(page); await expect(page.locator("#message")).toHaveAttribute("data-error", "true"); await page.locator("#binding-panel > summary").click(); await page.getByRole("button", { name: "Revisar referencias rechazadas", exact: true }).click(); await page.getByRole("button", { name: "Confirmar referencias revisadas", exact: true }).click(); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    const m = await prisma.minutaAccion.findFirstOrThrow({ where: { minutaId: f.minute.id }, include: { plazo: true } }); expect(m.estado).toBe("hecha"); expect(m.plazo!.estado).toBe("cumplido");
  } finally { await f.cleanup(); }
});
test("minutas: el documento confidencial y el acceso sin permiso quedan protegidos", async ({ page }) => {
  test.setTimeout(120000); const f = await fixture(page);
  try {
    await prepare(page, f.url("minuta"), "minuta"); await page.getByLabel("Confidencialidad de la minuta", { exact: true }).selectOption("true"); await sync(page); await expect(page.locator("#message")).toContainText("Registro sincronizado");
    const m = await prisma.minuta.findUniqueOrThrow({ where: { id: f.minute.id }, include: { documento: true } }); expect(m.documento!.confidencial).toBe(true);
    await page.request.post("/api/auth/logout"); await loginAs(page, f.b.email); await authenticateApiRequests(page);
    expect((await page.request.get(`/api/offline/entities?kind=minuta&id=${f.minute.id}`)).status()).toBe(403); expect((await page.request.get(`/api/minutas/${f.minute.id}`)).status()).toBe(403);
    const docs = await (await page.request.get(`/api/documentos?causaId=${f.cause.id}`)).json(); expect(JSON.stringify(docs)).not.toContain(m.documentoId);
  } finally { await f.cleanup(); }
});
