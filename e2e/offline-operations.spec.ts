import { test as baseTest, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/db";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs, authenticateApiRequests, apiRequest } from "./helpers";
import { networkGateway } from "./fixtures/network-gateway";
assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL)
    throw Error("Disposable database required");
const test = baseTest.extend<{
    network: Awaited<ReturnType<typeof networkGateway>>;
}>({ network: async ({}, provide, info) => { const n = await networkGateway(String(info.project.use.baseURL)); try {
        await provide(n);
    }
    finally {
        await n.close();
    } }, baseURL: async ({ network }, provide) => provide(network.origin) });
type Kind = "evento" | "tramite";
const key = "fictional-operations-offline-password", noun = (k: Kind) => k === "tramite" ? "trámite" : "evento", detail = (k: Kind) => k === "tramite" ? "Detalle del trámite" : "Notas del evento";
async function fixture(page: Page) {
    const tag = randomUUID(), a = await prisma.user.create({ data: { name: `Autor ${tag}`, email: `${tag}@offline-operations.invalid`, password: await hash("lexopen", 10), role: "abogado" } }), cause = await prisma.causa.create({ data: { titulo: `Causa ${tag}`, tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: a.id } });
    const event = await prisma.evento.create({ data: { titulo: `Evento ${tag}`, inicio: new Date("2092-11-24T15:00:00Z"), fin: new Date("2092-11-24T16:00:00Z"), causaId: cause.id, responsableId: a.id } });
    await prisma.evento.create({ data: { titulo: `Coincidencia privada ${tag}`, inicio: event.inicio, fin: event.fin, causaId: cause.id, responsableId: a.id } });
    await loginAs(page, a.email);
    await authenticateApiRequests(page);
    const res = await apiRequest(page).post(`/api/causas/${cause.id}/tramites`, { data: { titulo: `Trámite ${tag}`, detalle: "Detalle original", fechaLimite: "2092-11-25" } });
    expect(res.status()).toBe(201);
    const tramite = await res.json();
    return { a, cause, event, tramite, tag, id: (k: Kind) => k === "evento" ? event.id : tramite.id, url: (k: Kind) => `/offline.html?kind=${k}&record=${k === "evento" ? event.id : tramite.id}`, cleanup: async () => { await prisma.mensajeSaliente.deleteMany({ where: { userId: a.id } }); await prisma.notification.deleteMany({ where: { userId: a.id } }); await prisma.task.deleteMany({ where: { creatorId: a.id } }); await prisma.evento.deleteMany({ where: { responsableId: a.id } }); await prisma.causa.deleteMany({ where: { abogadoId: a.id } }); await prisma.commandExecution.deleteMany({ where: { ownerId: a.id } }); await prisma.auditEvent.deleteMany({ where: { actorId: a.id } }); await prisma.user.delete({ where: { id: a.id } }); } };
}
async function unlock(page: Page) { await page.getByLabel("Clave del espacio local").fill(key); await page.getByRole("button", { name: "Desbloquear", exact: true }).click(); await expect(page.getByRole("navigation", { name: "Áreas del espacio local" })).toBeVisible(); }
async function prepare(page: Page, url: string, k: Kind) { await page.goto(url); await page.getByLabel("Clave del espacio local").fill(key); page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "Crear espacio cifrado", exact: true }).click(); await page.getByRole("button", { name: `Preparar ${noun(k)}`, exact: true }).click(); await expect(page.locator("#message")).toContainText("Registro preparado"); await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true); }
async function sync(page: Page) { const b = page.getByRole("button", { name: "Sincronizar registro", exact: true }); await b.click(); await expect(b).toBeEnabled({ timeout: 40000 }); }
async function saved(page: Page) { await expect(page.locator("#record-local-state")).toHaveText("Copia local guardada"); }
for (const kind of ["evento", "tramite"] as const) {
    test(`${kind}: cifrado, recarga sin red y edición idempotente`, async ({ page, network }) => {
        test.setTimeout(120000);
        const f = await fixture(page);
        try {
            await prepare(page, f.url(kind), kind);
            network.setOffline(true);
            await page.getByLabel(detail(kind), { exact: true }).fill(`Contenido reservado ${f.tag}`);
            await saved(page);
            if (kind === "evento") await expect(page.locator("#operation-warning")).toContainText(`Coincidencia privada ${f.tag}`);
            await page.getByRole("button", { name: "Bloquear espacio", exact: true }).click();
            await expect(page.locator("#operation-warning")).toHaveText("");
            await expect(page.locator("#operation-readback")).toHaveText("");
            await unlock(page);
            const disk = await page.evaluate(async () => { const db = await new Promise<IDBDatabase>(r => { const q = indexedDB.open("lexopen-offline-v1"); q.onsuccess = () => r(q.result); }); const row = await new Promise<{
                bytes: ArrayBuffer;
            }>(r => { const q = db.transaction("vault").objectStore("vault").get("workspace"); q.onsuccess = () => r(q.result); }); db.close(); return JSON.stringify(row) + new TextDecoder().decode(row.bytes); });
            expect(disk).not.toContain(f.tag);
            expect(disk).not.toContain(f.id(kind));
            await page.reload();
            await unlock(page);
            await expect(page.getByLabel(detail(kind), { exact: true })).toHaveValue(`Contenido reservado ${f.tag}`);
            network.setOffline(false);
            await sync(page);
            await expect(page.locator("#message")).toContainText("Registro sincronizado");
            await sync(page);
            await expect(page.locator("#message")).toContainText("no tiene cambios");
            if (kind === "evento")
                expect((await prisma.evento.findUniqueOrThrow({ where: { id: f.event.id } })).notas).toBe(`Contenido reservado ${f.tag}`);
            else {
                const t = await prisma.task.findUniqueOrThrow({ where: { tramiteId: f.tramite.id } });
                expect(t.description).toBe(`Contenido reservado ${f.tag}`);
            }
        }
        finally {
            network.setOffline(false);
            await f.cleanup();
        }
    });
    test(`${kind}: alta con respuesta perdida y cambios posteriores conserva una identidad`, async ({ page, network }) => {
        test.setTimeout(120000);
        const f = await fixture(page);
        try {
            await prepare(page, f.url(kind), kind);
            await page.getByRole("button", { name: `Nuevo ${noun(kind)} local`, exact: true }).click();
            await expect(page.getByLabel(`Título del ${noun(kind)}`, { exact: true })).toHaveValue("");
            const local = await page.locator("#record-picker").inputValue();
            await page.getByLabel(`Título del ${noun(kind)}`, { exact: true }).fill(`Nuevo ${kind} ${f.tag}`);
            await page.getByLabel(detail(kind), { exact: true }).fill("Primer texto");
            await page.locator("#binding-panel > summary").click();
            await page.getByLabel(`Causa del ${noun(kind)}`, { exact: true }).selectOption(f.cause.id);
            if (kind === "evento") {
                await page.getByLabel("Inicio del evento", { exact: true }).fill("2092-11-27T10:00");
                await page.getByLabel("Fin del evento / último día incluido", { exact: true }).fill("2092-11-27T11:00");
                await page.locator("#operation-reviewed").check();
            }
            network.dropNextPost("/api/offline/sync");
            await sync(page);
            await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
            await page.getByLabel(detail(kind), { exact: true }).fill("Texto posterior");
            await saved(page);
            await page.reload();
            await unlock(page);
            await page.locator("#record-picker").selectOption(local);
            await sync(page);
            await expect(page.locator("#message")).toContainText("Envío anterior confirmado");
            const requests = () => network.requests.filter(r => r.path === "/api/offline/sync").map(r => r.body);
            expect(requests()[1]).toBe(requests()[0]);
            await sync(page);
            await expect(page.locator("#message")).toContainText("Registro sincronizado");
            expect(JSON.parse(requests()[2]).requestId).not.toBe(JSON.parse(requests()[0]).requestId);
            if (kind === "evento") {
                const rows = await prisma.evento.findMany({ where: { titulo: `Nuevo ${kind} ${f.tag}` } });
                expect(rows).toHaveLength(1);
                expect(rows[0].notas).toBe("Texto posterior");
            }
            else {
                const rows = await prisma.tramite.findMany({ where: { titulo: `Nuevo ${kind} ${f.tag}` } });
                expect(rows).toHaveLength(1);
                expect(rows[0].detalle).toBe("Texto posterior");
                expect(await prisma.task.count({ where: { tramiteId: rows[0].id } })).toBe(1);
            }
        }
        finally {
            await f.cleanup();
        }
    });
    test(`${kind}: cambio en otra sesión conserva el texto local`, async ({ page }) => { const f = await fixture(page); try {
        await prepare(page, f.url(kind), kind);
        await page.getByLabel(detail(kind), { exact: true }).fill("Texto local conservado");
        if (kind === "evento")
            await prisma.evento.update({ where: { id: f.event.id }, data: { notas: "Cambio remoto" } });
        else
            await prisma.task.update({ where: { tramiteId: f.tramite.id }, data: { instructions: "Instrucción posterior" } });
        await sync(page);
        await expect(page.locator("#message")).toContainText("cambió");
        await expect(page.getByLabel(detail(kind), { exact: true })).toHaveValue("Texto local conservado");
        if (kind === "tramite")
            expect((await prisma.task.findUniqueOrThrow({ where: { tramiteId: f.tramite.id } })).description).toBe("Detalle original");
    }
    finally {
        await f.cleanup();
    } });
    test(`${kind}: permiso revocado impide sincronizar`, async ({ page }) => { const f = await fixture(page); try {
        await prepare(page, f.url(kind), kind);
        await page.getByLabel(detail(kind), { exact: true }).fill("Cambio pendiente");
        await prisma.user.update({ where: { id: f.a.id }, data: { capabilityRevokes: kind === "evento" ? "evento.manage" : "causa.write" } });
        await sync(page);
        await expect(page.locator("#message")).toHaveAttribute("data-error", "true");
        await expect(page.getByLabel(detail(kind), { exact: true })).toHaveValue("Cambio pendiente");
    }
    finally {
        await f.cleanup();
    } });
}
test("Agenda: día completo, fin exclusivo y revisión de fechas", async ({ page }) => { const f = await fixture(page); try {
    await prepare(page, f.url("evento"), "evento");
    await page.getByLabel("Evento de día completo", { exact: true }).selectOption("true");
    await page.getByLabel("Inicio del evento", { exact: true }).fill("2092-11-27");
    await page.getByLabel("Fin del evento / último día incluido", { exact: true }).fill("2092-11-29");
    await sync(page);
    await expect(page.locator("#message")).toContainText("Revise expresamente");
    await page.locator("#operation-reviewed").check();
    await sync(page);
    await expect(page.locator("#message")).toContainText("Registro sincronizado");
    const row = await prisma.evento.findUniqueOrThrow({ where: { id: f.event.id } });
    expect(row.inicio.toISOString()).toBe("2092-11-27T00:00:00.000Z");
    expect(row.fin!.toISOString()).toBe("2092-11-30T00:00:00.000Z");
}
finally {
    await f.cleanup();
} });
test("Agenda: evento importado de Google es de consulta", async ({ page }) => { const f = await fixture(page); try {
    await prisma.evento.update({ where: { id: f.event.id }, data: { googleEventId: f.tag } });
    await prepare(page, f.url("evento"), "evento");
    await expect(page.getByLabel("Título del evento", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Sincronizar registro", exact: true })).toBeDisabled();
    await expect(page.locator("#operation-notice")).toContainText("Copia de consulta");
}
finally {
    await f.cleanup();
} });
test("Trámites normales: respuesta perdida conserva el envío y no duplica", async ({ page, network }) => { const f = await fixture(page); try {
    await page.goto(`/causas/${f.cause.id}#tramites`);
    const main = page.locator("#main-content"), title = main.getByPlaceholder("Nuevo trámite pendiente", { exact: true }), form = title.locator("xpath=ancestor::form");
    await title.fill(`Alta nativa ${f.tag}`);
    network.dropNextPost(`/api/causas/${f.cause.id}/tramites`);
    await form.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(main.getByRole("alert")).toContainText("Reintente");
    await expect(title).toBeDisabled();
    await form.getByRole("button", { name: "Reintentar envío", exact: true }).click();
    await expect(title).toBeEnabled();
    await expect(title).toHaveValue("");
    expect(await prisma.tramite.count({ where: { titulo: `Alta nativa ${f.tag}` } })).toBe(1);
    const requests = network.requests.filter(r => r.path === `/api/causas/${f.cause.id}/tramites`).slice(-2);
    expect(requests[1].body).toBe(requests[0].body);
}
finally {
    await f.cleanup();
} });
test("Trámites normales: conflicto de versión mantiene el formulario", async ({ page }) => { const f = await fixture(page); try {
    await page.goto(`/causas/${f.cause.id}#tramites`);
    const article = page.locator("#main-content article").filter({ has: page.getByText(f.tramite.titulo, { exact: true }) });
    await article.getByRole("button", { name: "Editar", exact: true }).click();
    await article.getByLabel("Detalle opcional", { exact: true }).fill("Edición local sin perder");
    await prisma.tramite.update({ where: { id: f.tramite.id }, data: { detalle: "Edición remota" } });
    await article.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.locator("#main-content").getByRole("alert")).toContainText("cambió");
    await expect(article.getByLabel("Detalle opcional", { exact: true })).toHaveValue("Edición local sin perder");
    expect((await prisma.tramite.findUniqueOrThrow({ where: { id: f.tramite.id } })).detalle).toBe("Edición remota");
}
finally {
    await f.cleanup();
} });

test("Trámites normales: recargar tras perder la respuesta reutiliza la identidad sin guardar texto en sesión", async ({ page, network }) => {
    const f = await fixture(page);
    try {
        await page.goto(`/causas/${f.cause.id}#tramites`);
        const input = page.locator("#main-content").getByPlaceholder("Nuevo trámite pendiente", { exact: true });
        const form = input.locator("xpath=ancestor::form");
        await input.fill(`Alta recuperada ${f.tag}`);
        network.dropNextPost(`/api/causas/${f.cause.id}/tramites`);
        await form.getByRole("button", { name: "Agregar", exact: true }).click();
        await expect(page.locator("#main-content").getByRole("alert")).toContainText("Reintente");
        const session = await page.evaluate(() => JSON.stringify(sessionStorage));
        expect(session).not.toContain(`Alta recuperada ${f.tag}`);
        await page.reload();
        await input.fill(`Alta recuperada ${f.tag}`);
        await form.getByRole("button", { name: "Agregar", exact: true }).click();
        await expect(input).toHaveValue("");
        expect(await prisma.tramite.count({ where: { titulo: `Alta recuperada ${f.tag}` } })).toBe(1);
        const requests = network.requests.filter(r => r.path === `/api/causas/${f.cause.id}/tramites`).slice(-2);
        expect(requests[1].body).toBe(requests[0].body);
    } finally { await f.cleanup(); }
});

test("Trámites normales: editar detalle conserva la precisión de la fecha existente", async ({ page }) => {
    const f = await fixture(page);
    try {
        const due = new Date("2092-11-25T17:43:21.123Z");
        await prisma.tramite.update({ where: { id: f.tramite.id }, data: { fechaLimite: due } });
        await prisma.task.update({ where: { tramiteId: f.tramite.id }, data: { dueDate: due, instructions: "Instrucciones independientes" } });
        await page.goto(`/causas/${f.cause.id}#tramites`);
        const article = page.locator("#main-content article").filter({ has: page.getByText(f.tramite.titulo, { exact: true }) });
        await article.getByRole("button", { name: "Editar", exact: true }).click();
        await article.getByLabel("Detalle opcional", { exact: true }).fill("Detalle corregido");
        await article.getByRole("button", { name: "Guardar", exact: true }).click();
        await expect(article.getByRole("button", { name: "Guardar", exact: true })).toHaveCount(0);
        expect((await prisma.tramite.findUniqueOrThrow({ where: { id: f.tramite.id } })).fechaLimite!.toISOString()).toBe(due.toISOString());
        const task = await prisma.task.findUniqueOrThrow({ where: { tramiteId: f.tramite.id } });
        expect(task.dueDate!.toISOString()).toBe(due.toISOString());
        expect(task.instructions).toBe("Instrucciones independientes");
    } finally { await f.cleanup(); }
});
