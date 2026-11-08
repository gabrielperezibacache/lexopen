import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

const api = "/api/altazor/computer", sessionId = "viewer-fixture-session";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ioAAAAASUVORK5CYII=", "base64");

async function fixture(page: Page, working = false) {
  let held = false, failFrame = false, captures = 0;
  const reads: Array<Record<string, unknown>> = [];
  const turns = Array.from({ length: working ? 18 : 2 }, (_, index) => ({
    index, from: index % 2 ? "assistant" : "user", working: working && index === 17, needsHelp: false, actionCount: working && index === 17 ? 125 : index % 2 ? 2 : 0,
    text: index % 2 ? `**Resultado ${index}**\n\n- Primer hallazgo\n- Segundo hallazgo\n\n${"Antecedente ficticio para revisar. ".repeat(working ? 20 : 1)}` : `Encargo ficticio ${index}`,
    steps: index % 2 ? [{ action: "read_browser_internal_text", at: "2026-11-08T12:00:00Z" }, { action: "inspect_document_internal_text", at: "2026-11-08T12:00:01Z" }] : [],
  }));
  const session = () => ({ id: sessionId, state: "ready", held, canRenew: false, connectors: [], createdAt: "2026-11-08T12:00:00Z", expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(), renewableUntil: new Date(Date.now() + 120 * 60_000).toISOString() });
  await page.route(url => url.pathname === `${api}/activity`, route => route.fulfill({ json: { state: "ready", sessionId, monitor: false } }));
  await page.route(url => url.pathname === api, route => route.fulfill({ json: { computer: { enabled: true, configured: true, policyAllowed: true, canConfigure: false, state: "configured", workspaceId: null, sessions: [session()] } } }));
  await page.route(url => url.pathname === `${api}/sessions/${sessionId}`, route => route.fulfill({ json: { session: session(), runtime: "container", kittyStatus: "running", working, turns, approvals: [] } }));
  await page.route(url => url.pathname === `${api}/sessions/${sessionId}/screenshot`, route => {
    if (new URL(route.request().url()).searchParams.has("frame")) captures++;
    return failFrame ? route.fulfill({ status: 503, json: { error: "Fallo ficticio de captura" } }) : route.fulfill({ body: png, contentType: "image/png" });
  });
  await page.route(url => url.pathname === `${api}/sessions/${sessionId}/actions`, route => {
    const data = route.request().postDataJSON();
    if (data.action === "control") held = data.hold;
    return route.fulfill({ json: { action: { id: "fixture-action", status: "completed", result: { held } } } });
  });
  await page.route(url => url.pathname === `${api}/sessions/${sessionId}/read`, route => {
    const data = route.request().postDataJSON() as Record<string, unknown>; reads.push(data);
    const offset = Number(data.offset || 0);
    return route.fulfill({ json: { reading: { version: "v1", source: data.source, title: data.source === "browser" ? "Página interna ficticia" : "Documento ficticio", ...(data.source === "browser" ? { url: "https://example.test/reporte" } : {}), text: offset ? "Segundo bloque de texto semántico." : "Texto semántico seleccionado sin imagen.", totalChars: 12000, offset, nextOffset: offset ? null : 6000, items: [{ ref: 1, role: "link", label: "Informe de prueba" }], elementOffset: 0, nextElementOffset: null, method: data.source === "browser" ? "dom" : "pdf-text", redacted: true } } });
  });
  await loginAs(page, "abogado@estudio.cl");
  await page.getByRole("region", { name: "Escritorio de Altazor", exact: true }).getByRole("button", { name: "Abrir escritorio", exact: false }).click();
  const panel = page.getByTestId("altazor-computer-panel");
  await expect(panel.getByRole("region", { name: "Visor del escritorio", exact: true })).toBeVisible();
  await expect.poll(() => panel.getByRole("img", { name: "Captura del escritorio privado en contenedor" }).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  return { panel, reads, captures: () => captures, fail: (value: boolean) => { failFrame = value; }, addMessage: () => turns.push({ index: turns.length, from: "assistant", working: false, needsHelp: false, actionCount: 0, text: "Nuevo resultado ficticio.", steps: [] }) };
}

test("visor accesible, lectura semántica paginada y recuperación de captura sin enviar tareas", async ({ page }, info) => {
  const view = await fixture(page);
  const viewer = view.panel.getByRole("region", { name: "Visor del escritorio", exact: true });
  expect(view.reads).toHaveLength(0);
  await view.panel.getByText("Leer como texto", { exact: true }).click();
  await view.panel.getByRole("button", { name: "Leer contenido", exact: true }).click();
  await expect(view.panel.getByRole("region", { name: "Contenido leído como texto" })).toContainText("Texto semántico seleccionado sin imagen.");
  expect(view.reads[0]).toMatchObject({ source: "browser", limit: 6000 });
  await view.panel.getByRole("button", { name: "Siguiente bloque de texto" }).click();
  await expect(view.panel.getByLabel("Texto extraído del escritorio", { exact: true })).toContainText("Segundo bloque de texto semántico.");
  expect(view.reads[1].offset).toBe(6000);
  await view.panel.getByRole("combobox", { name: "Contenido", exact: true }).selectOption("document");
  await view.panel.getByLabel("Ruta del archivo en la carpeta de trabajo", { exact: true }).fill("informes/contrato.pdf");
  await view.panel.getByRole("button", { name: "Leer contenido", exact: true }).click();
  await expect(view.panel.getByRole("region", { name: "Contenido leído como texto" })).toContainText("Texto del PDF");
  expect(view.reads[2]).toMatchObject({ source: "document", path: "informes/contrato.pdf" });
  await viewer.getByRole("button", { name: "150 %", exact: true }).click();
  await expect(viewer.getByRole("button", { name: "150 %", exact: true })).toHaveAttribute("aria-pressed", "true");
  await viewer.getByRole("button", { name: "Vista completa", exact: true }).click();
  if (await page.evaluate(() => document.fullscreenEnabled)) {
    await viewer.getByRole("button", { name: "Pantalla completa", exact: true }).click();
    await expect(viewer.getByRole("button", { name: "Salir de pantalla completa" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer.getByRole("button", { name: "Pantalla completa", exact: true })).toBeVisible();
  }
  view.fail(true);
  await viewer.getByRole("button", { name: "Actualizar captura", exact: true }).click();
  await expect(viewer.getByRole("alert")).toContainText("No se pudo cargar la captura actual");
  view.fail(false);
  await viewer.getByRole("button", { name: "Volver a cargar captura" }).click();
  await expect(viewer.getByRole("alert")).toHaveCount(0);
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await viewer.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`visor-${width}.png`), animations: "disabled" });
  }
});

test("los pasos quedan resumidos y el sondeo conserva la posición de lectura", async ({ page }) => {
  await page.clock.install();
  const view = await fixture(page, true), log = view.panel.getByRole("log", { name: "Conversación del escritorio" });
  const details = log.locator("details").last();
  await expect(details.locator("summary")).toHaveText("125 acciones realizadas · Ver detalle");
  await expect(details.locator("li").first()).not.toBeVisible();
  await expect(log.locator("strong").filter({ hasText: "Resultado 17" })).toBeVisible();
  await log.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll")); });
  view.addMessage();
  await page.clock.fastForward(6500);
  await expect(view.panel.getByRole("button", { name: "Ver mensajes nuevos", exact: true })).toBeVisible();
  expect(await log.evaluate(element => element.scrollTop)).toBeLessThan(10);
  await view.panel.getByRole("button", { name: "Ver mensajes nuevos", exact: true }).click();
  await expect(log).toContainText("Nuevo resultado ficticio.");
  const before = view.captures();
  await page.clock.fastForward(8500);
  await expect.poll(() => view.captures()).toBeGreaterThan(before);
  await view.panel.getByRole("button", { name: "Tomar control", exact: true }).click();
  await expect(view.panel).toContainText("Control manual · actualización automática pausada");
  await expect(view.panel.getByRole("img", { name: "Captura del escritorio privado en contenedor" })).toBeVisible();
  const heldCaptures = view.captures();
  await page.clock.fastForward(20_000);
  expect(view.captures()).toBe(heldCaptures);
  await view.panel.getByText("Leer como texto", { exact: true }).click();
  await expect(view.panel.getByRole("button", { name: "Leer contenido", exact: true })).toBeDisabled();
});
