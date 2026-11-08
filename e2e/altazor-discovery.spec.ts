/** Fictitious search response for UI; saved query/RIS import/export use real APIs. */
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";
const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (new URL(process.env.DATABASE_URL!).toString() !== url) throw Error("Use the explicitly disposable fixture");
const db = new PrismaClient({ datasources: { db: { url } } }), tag = randomUUID(), email = `discovery-${tag}@example.test`;
let ownerId = "";
test.beforeAll(async () => { ownerId = (await db.user.create({ data: { name: "Investigadora ficticia", email, password: await hash("lexopen", 10), role: "abogado" } })).id; });
test.afterAll(async () => { try { if (ownerId) { await db.altazorAcademicSearch.deleteMany({ where: { ownerId } }); await db.altazorBibliographyEntry.deleteMany({ where: { ownerId } }); await db.auditEvent.deleteMany({ where: { actorId: ownerId } }); await db.user.deleteMany({ where: { id: ownerId } }); } } finally { await db.$disconnect(); } });
async function openDiscovery(page: Page) {
  await page.goto("/academico");
  await expect(page.getByText("Abriendo tus trabajos académicos…", { exact: true })).toBeHidden({ timeout: 15_000 });
  await page.getByRole("button", { name: "Buscar bibliografía", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Descubrir y citar", exact: true })).toBeVisible();
}
test("Descubrimiento académico: consultas por acción, bibliografía persistente y lectura móvil con datos ficticios", async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => { Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true }); });
  await loginAs(page, email); let searches = 0;
  const remoteRequests: string[] = [];
  page.on("request", request => {
    if (request.method() !== "POST") return;
    const path = new URL(request.url()).pathname;
    if (path === "/api/altazor/academic/discovery" || /\/discovery\/(graph|orcid|saved\/[^/]+\/refresh)$/.test(path)
      || (path.endsWith("/discovery/bibliography") && request.postDataJSON()?.kind === "remote")) remoteRequests.push(path);
  });
  await page.route("**/api/altazor/academic/discovery", async route => {
    if (route.request().method() !== "POST") return route.continue(); searches++;
    expect(route.request().postDataJSON()).toMatchObject({ query: "educación jurídica ficticia", allowExternal: true });
    const metadata = { title: "Investigación enteramente ficticia sobre educación jurídica", authors: [{ family: "Prueba", given: "Ana", name: "" }], year: 2024, containerTitle: "Revista ficticia", volume: "1", issue: "2", pages: "10-20", publisher: "", doi: "10.5555/fictitious-browser-search", openalexId: "W1", type: "article", warnings: [] };
    await route.fulfill({ json: { query: "educación jurídica ficticia", results: [{ key: "doi:10.5555/fictitious-browser-search", metadata, provider: "crossref", sourceUrl: "https://api.crossref.org/works/10.5555%2Ffictitious-browser-search", landingUrl: "https://doi.org/10.5555/fictitious-browser-search", checkedAt: "2026-11-04T12:00:00.000Z", openAccess: null, citedByCount: 0 }], warnings: [], checkedAt: "2026-11-04T12:00:00.000Z" } });
  });
  await openDiscovery(page);
  await expect(page.getByRole("checkbox", { name: /Autorizo enviar sólo los términos/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Buscar obras", exact: true })).toBeDisabled();
  expect(remoteRequests).toEqual([]);
  await page.getByLabel("Tema o referencia bibliográfica", { exact: true }).fill("educación jurídica ficticia");
  await expect(page.getByRole("button", { name: "Buscar obras", exact: true })).toBeEnabled();
  await page.getByRole("checkbox", { name: "Crossref", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "OpenAlex", exact: true }).uncheck();
  await expect(page.getByRole("button", { name: "Buscar obras", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: "Crossref", exact: true }).check();
  await page.getByRole("checkbox", { name: "OpenAlex", exact: true }).check();
  await expect(page.getByRole("button", { name: "Buscar obras", exact: true })).toBeEnabled();
  expect(searches).toBe(0);
  expect(remoteRequests).toEqual([]);
  await page.getByRole("button", { name: "Buscar obras", exact: true }).click();
  await expect(page.getByRole("link", { name: "Investigación enteramente ficticia sobre educación jurídica" })).toBeVisible(); expect(searches).toBe(1);
  const graphRequests: string[] = [];
  const titles = {
    W1: "Investigación enteramente ficticia sobre educación jurídica",
    W2: "Referencia ficticia de ética",
    W3: "Obra citante ficticia",
    W4: "Obra temática ficticia",
  };
  const graphPaper = (id: keyof typeof titles) => ({
    key: `openalex:${id}`, metadata: { openalexId: id, title: titles[id], authors: [], year: 2024, doi: "" },
    landingUrl: `https://openalex.org/${id}`,
  });
  await page.route("**/api/altazor/academic/discovery/graph", async route => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    const { openalexId } = request.postDataJSON();
    expect(request.postDataJSON()).toEqual({ openalexId, allowExternal: true });
    graphRequests.push(openalexId);
    const centerId = openalexId === "W2" ? "W2" : "W1";
    const nodes = centerId === "W1" ? [graphPaper("W1"), graphPaper("W2"), graphPaper("W3"), graphPaper("W4")] : [graphPaper("W2")];
    const edges = centerId === "W1" ? [
      { from: "W1", to: "W2", relation: "cites" },
      { from: "W3", to: "W1", relation: "cites" },
      { from: "W1", to: "W4", relation: "related" },
    ] : [];
    await route.fulfill({ json: { centerId, nodes, edges, checkedAt: "2026-11-04T12:00:00.000Z", notice: "Metadatos ficticios del vecindario de citas.", limited: false } });
  });
  await page.setViewportSize({ width: 360, height: 800 });
  const openGraph = page.getByRole("button", { name: "Explorar red de citas", exact: true });
  await openGraph.click();
  const graph = page.getByRole("region", { name: "Red bibliográfica consultada" });
  const map = graph.getByRole("group", { name: "Grafo interactivo de citas", exact: true });
  const selected = graph.getByRole("region", { name: "Obra seleccionada" });
  await expect(graph.getByRole("heading", { name: "Red de citas", exact: true })).toBeFocused();
  await expect(map).toHaveAttribute("viewBox", "0 0 600 420");
  await graph.getByRole("button", { name: "Acercar red", exact: true }).click();
  await expect(graph.getByLabel("Nivel de acercamiento")).toHaveText("120 %");
  await map.scrollIntoViewIfNeeded();
  const originalBox = await map.getAttribute("viewBox"), box = await map.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 16, box!.y + 20);
  await page.mouse.down();
  await page.mouse.move(box!.x + 50, box!.y + 32, { steps: 5 });
  await page.mouse.up();
  await expect(map).not.toHaveAttribute("viewBox", originalBox!);
  await graph.getByRole("button", { name: "Restablecer vista de la red", exact: true }).click();
  await expect(map).toHaveAttribute("viewBox", "0 0 600 420");
  const citing = map.getByRole("button", { name: titles.W3, exact: true });
  await citing.focus();
  await page.keyboard.press("Enter");
  await expect(citing).toHaveAttribute("aria-pressed", "true");
  await expect(selected).toContainText("Cita a la obra consultada");
  await graph.getByLabel("Buscar en esta red", { exact: true }).fill("etica");
  await graph.getByRole("button", { name: "Centrar coincidencia", exact: true }).click();
  await expect(selected).toContainText(titles.W2);
  await expect(selected).toContainText("Citada por la obra consultada");
  expect(graphRequests).toEqual(["W1"]);
  const expand = selected.getByRole("button", { name: "Consultar red de esta obra", exact: true });
  await expect(expand).toBeEnabled();
  await expand.click();
  await expect(selected).toContainText("Obra consultada");
  await expect(selected).toContainText(titles.W2);
  expect(graphRequests).toEqual(["W1", "W2"]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await graph.getByRole("button", { name: "Cerrar red", exact: true }).click();
  await expect(openGraph).toBeFocused();
  await page.getByText("Búsquedas temáticas y alertas", { exact: false }).click();
  await page.getByLabel("Nombre de esta búsqueda", { exact: true }).fill("Tema académico ficticio conservado");
  await page.getByRole("button", { name: "Guardar búsqueda", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tema académico ficticio conservado", exact: true })).toBeVisible();
  await page.locator("summary").filter({ hasText: /^Mi bibliografía/ }).click();
  await page.getByText("Importar una bibliografía", { exact: true }).click();
  const remoteBeforeImport = remoteRequests.length;
  let imports = 0;
  page.on("request", request => { if (new URL(request.url()).pathname.endsWith("/bibliography/import")) imports++; });
  const file = page.getByLabel("Archivo de referencias (.bib, .ris o .json)");
  const text = page.getByLabel("Contenido de la bibliografía", { exact: true });
  const format = page.getByLabel("Formato de importación bibliográfica", { exact: true });
  const submit = page.getByRole("button", { name: "Importar referencias", exact: true });
  const title = "Referencia ficticia incorporada por el profesional", content = `TY  - JOUR\nTI  - ${title}\nAU  - Ficticia, Ana\nPY  - 2024\nJO  - Revista de pruebas\nDO  - 10.5555/fictitious-browser-import\nER  - \n`;
  await text.fill("Texto aún sin importar");
  await file.setInputFiles({ name: "equivocado.txt", mimeType: "text/plain", buffer: Buffer.from(content) });
  await expect(page.getByText("Elige un archivo .bib, .ris o .json.", { exact: true })).toBeVisible();
  await expect(text).toHaveValue("Texto aún sin importar");
  await file.setInputFiles({ name: "referencias.RIS", mimeType: "application/x-research-info-systems", buffer: Buffer.from(content) });
  await expect(format).toHaveValue("ris");
  await expect(text).toHaveValue(content);
  expect(imports).toBe(0);
  await submit.click();
  await expect(page.getByText("Se incorporó 1 referencia.", { exact: true })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: title }).first()).toBeVisible();
  expect(imports).toBe(1);
  await text.fill(content);
  await submit.click();
  await expect(page.getByText("1 referencia ya estaba en tu bibliografía.", { exact: true })).toBeVisible();
  expect(imports).toBe(2);
  expect(remoteRequests).toHaveLength(remoteBeforeImport);
  await page.getByLabel("Estilo bibliográfico", { exact: true }).selectOption("ris");
  const selectStyle = await page.getByLabel("Estilo bibliográfico", { exact: true }).evaluate(select => {
    const style = getComputedStyle(select);
    return { appearance: style.appearance, padding: parseFloat(style.paddingInlineEnd), size: style.backgroundSize, image: style.backgroundImage };
  });
  expect(selectStyle.appearance).toBe("none");
  expect(selectStyle.padding).toBeGreaterThanOrEqual(44);
  expect(selectStyle.size).toBe("16px 16px");
  expect(selectStyle.image).not.toBe("none");
  await expect(page.locator("p").filter({ hasText: /TY  - JOUR/ }).first()).toBeVisible();
  const pending = page.waitForEvent("download"); await page.getByRole("link", { name: "Descargar bibliografía", exact: true }).click(); const download = await pending, destination = info.outputPath("bibliografia-ficticia.ris"); await download.saveAs(destination);
  const exported = await readFile(destination, "utf8"); expect(exported).toContain(title); expect(exported).toContain("DO  - 10.5555/fictitious-browser-import");
  await page.reload(); await openDiscovery(page);
  await page.getByText("Búsquedas temáticas y alertas", { exact: false }).click(); await expect(page.getByRole("heading", { name: "Tema académico ficticio conservado", exact: true })).toBeVisible();
  await page.locator("summary").filter({ hasText: /^Mi bibliografía/ }).click(); await expect(page.locator("p").filter({ hasText: title }).first()).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("heading", { name: "Descubrir y citar", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("altazor-discovery-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByText("Importar una bibliografía", { exact: true }).click();
  await page.getByRole("heading", { name: "Descubrir y citar", exact: true }).scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(page.getByLabel("Estilo bibliográfico", { exact: true })).toBeVisible();
  await expect(file).toBeVisible();
  await page.screenshot({ path: info.outputPath("altazor-discovery-mobile.png"), fullPage: true });
});
