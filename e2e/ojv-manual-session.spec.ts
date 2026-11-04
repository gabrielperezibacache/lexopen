import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loginAs } from "./helpers";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import type { ManualOjvUiResponse, ManualOjvUiSession } from "../src/lib/pjud/manual-session-contract";

assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
const capabilities = { available: true, allowed: true, hostLocal: true, reason: null, importLimit: 20 };
const coverage = { status: "complete" as const, total: 3, read: 3, items: [
  { key: "cuaderno:1.0", label: "1.0 - Principal", status: "ok" as const, count: 8 },
  { key: "cuaderno:1.1", label: "1.1 - Excepciones Dilatorias", status: "ok" as const, count: 2 },
  { key: "cuaderno:2.0", label: "2.0 - Cumplimiento incidental", status: "ok" as const, count: 4 },
] };
function session(override: Partial<ManualOjvUiSession> = {}): ManualOjvUiSession {
  return { id: "opaque-session-fixture", phase: "ready", expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(), authenticated: true,
    listedAt: null, materiasTried: [], candidates: [], progress: null, result: null, error: null, ...override };
}
function candidates(count = 3) {
  return Array.from({ length: count }, (_, index) => ({ id: `opaque-fixture-${index}`, rit: `C-${100 + index}-2024`, tribunal: "1º Juzgado Civil de Santiago", caratula: `Causa ficticia para revisión ${index + 1}`, estado: "Tramitación" }));
}
async function legacyStatus(page: Page) {
  await page.route("**/api/pjud/mis-causas", route => route.fulfill({ json: { status: { enabled: false, rutMasked: null, hasPassword: false, lastSyncAt: null, lastSyncStatus: null, lastSyncNote: null, readyToSync: false, blockers: [] }, causasCount: 0, capabilities: { sync: true, credentials: false } } }));
}
async function openPanel(page: Page) {
  await legacyStatus(page);
  await page.goto("/causas/mis-causas");
  return page.getByRole("region", { name: "Su cuenta judicial, su cartera", exact: true });
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ locale: "es-CL" });
  try { await loginAs(await context.newPage(), "socio@estudio.cl"); cookies = await context.cookies(); }
  finally { await context.close(); }
});
test.beforeEach(async ({ context }) => { await context.addCookies(cookies); });

test("ingreso manual, selección explícita e importación con cobertura completa y parcial", async ({ page }, info) => {
  let current: ManualOjvUiSession | null = null;
  const payloads: Record<string, unknown>[] = [];
  let importingPolls = 0;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/pjud/manual-session", async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON(); payloads.push(body);
      if (body.action === "start") current = session({ phase: "waiting-login", authenticated: false });
      if (body.action === "list") current = session({ listedAt: "2026-11-03T18:00:00Z", materiasTried: ["Civil"], candidates: candidates() });
      if (body.action === "import") current = { ...current!, phase: "importing", progress: { total: 2, completed: 0, currentRit: "C-100-2024" }, result: null };
      if (body.action === "close") current = current && { ...current, phase: "closed", authenticated: false };
    } else if (current?.phase === "importing") {
      importingPolls++;
      if (importingPolls >= 2) current = { ...current, phase: "completed", progress: { completed: 2, total: 2 }, result: { created: 2, linked: 0, syncOk: 1, syncPartial: 1, syncFailed: 0, inserted: 24, items: [
        { causaId: "fictitious-cause-a", rit: "C-100-2024", tribunal: "1º Juzgado Civil de Santiago", status: "ok", cuadernosCoverage: coverage },
        { causaId: "fictitious-cause-b", rit: "C-101-2024", tribunal: "1º Juzgado Civil de Santiago", status: "partial", cuadernosCoverage: { ...coverage, status: "partial", read: 2, items: coverage.items.map((item, index) => index === 2 ? { ...item, status: "failed", count: 0, note: "Cuaderno ficticio sin respuesta. Puede reintentar." } : item) } },
      ] } };
    }
    await route.fulfill({ json: { capabilities, session: current } satisfies ManualOjvUiResponse });
  });
  const panel = await openPanel(page);
  await expect(panel.getByRole("button", { name: "Ingresar con ClaveÚnica", exact: true })).toBeEnabled();
  await expect(panel.locator('input[type="password"]')).toHaveCount(0);
  await panel.getByRole("button", { name: "Ingresar con ClaveÚnica", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Complete su ingreso en la ventana oficial" })).toBeVisible();
  expect(payloads).toEqual([{ action: "start" }]);
  await expect(panel.getByText(/ventana temporal abierta por LexOpen, distinta de su navegador habitual/)).toBeVisible();
  await panel.getByRole("button", { name: "Mostrar ventana oficial", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Complete su ingreso en la ventana oficial" })).toBeVisible();
  expect(payloads.at(-1)).toEqual({ action: "focus", sessionId: "opaque-session-fixture" });
  current = session();
  await expect(panel.getByRole("button", { name: "Consultar Mis Causas", exact: true })).toBeVisible();
  await panel.getByLabel("Materia", { exact: true }).selectOption("Civil");
  await panel.getByRole("button", { name: "Consultar Mis Causas", exact: true }).click();
  await expect(panel.getByText(/3 causas recibidas/)).toBeVisible();
  expect(payloads.some(body => body.action === "import")).toBeFalsy();
  const choices = panel.locator(".pjud-manual-case-list input");
  await choices.nth(0).check(); await choices.nth(1).check();
  await panel.getByLabel("Filtrar el listado").fill("revisión 3");
  await expect(panel.getByRole("list", { name: "Causas seleccionadas" }).getByText("C-100-2024", { exact: true })).toBeVisible();
  await expect(panel.getByRole("list", { name: "Causas seleccionadas" }).getByText("C-101-2024", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Mostrar ventana oficial", exact: true }).click();
  await expect(panel.getByLabel("Filtrar el listado")).toHaveValue("revisión 3");
  await expect(panel.getByRole("list", { name: "Causas seleccionadas" }).locator("li")).toHaveCount(2);
  await panel.getByLabel("Filtrar el listado").fill("");
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("ojv-manual-selection-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: info.outputPath("ojv-manual-selection-mobile.png"), fullPage: true });
  await panel.getByRole("button", { name: "Importar 2 causas seleccionadas", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Recuperando los cuadernos de sus causas" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Mostrar ventana oficial", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("heading", { name: "Resultado de la importación" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Resultado de la importación" })).toBeFocused();
  expect(payloads.find(body => body.action === "import")).toEqual({ action: "import", sessionId: "opaque-session-fixture", candidateIds: ["opaque-fixture-0", "opaque-fixture-1"] });
  const reports = panel.locator(".pjud-manual-result .pjud-cuadernos");
  await expect(reports.nth(0)).toHaveAttribute("data-status", "complete");
  await expect(reports.nth(1)).toHaveAttribute("data-status", "partial");
  await panel.getByRole("button", { name: "Mostrar ventana oficial", exact: true }).click();
  await expect(panel.getByText("Importación terminada", { exact: true })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Resultado de la importación" })).toBeVisible();
  expect(payloads.filter(body => body.action === "start")).toHaveLength(1);
  await reports.nth(1).locator("summary").click();
  await expect(reports.nth(1).getByText("Lectura incompleta", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("ojv-manual-result-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: info.outputPath("ojv-manual-result-mobile.png"), fullPage: true });
  await panel.getByRole("button", { name: "Continuar con otras causas de este listado", exact: true }).click();
  await expect(panel.getByRole("list", { name: "Pasos de incorporación" }).locator('[aria-current="step"]')).toContainText("Revisar las causas");
  await expect(panel.getByText("Recibo de la importación anterior", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Volver a consultar Mis Causas", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Cerrar conexión", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Conexión cerrada", exact: true })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Ver mi cartera" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("límite de lote, selección entre páginas y consulta vacía diferenciada", async ({ page }) => {
  let current = session({ listedAt: "2026-11-03T18:00:00Z", materiasTried: ["Civil"], candidates: candidates(25) });
  await page.route("**/api/pjud/manual-session", async route => {
    if (route.request().method() === "POST" && route.request().postDataJSON().action === "list") current = session({ listedAt: "2026-11-03T18:01:00Z", materiasTried: ["Civil"], candidates: [] });
    await route.fulfill({ json: { capabilities, session: current } });
  });
  const panel = await openPanel(page);
  await panel.getByRole("button", { name: "Seleccionar esta página", exact: true }).click();
  await expect(panel.getByText("20 seleccionadas", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(panel.locator(".pjud-manual-case-list input").first()).toBeDisabled();
  await expect(panel.getByRole("list", { name: "Causas seleccionadas" }).locator("li")).toHaveCount(20);
  await panel.getByRole("button", { name: "Quitar toda la selección", exact: true }).click();
  await expect(panel.locator(".pjud-manual-case-list input").first()).toBeEnabled();
  await panel.getByRole("button", { name: "Volver a consultar Mis Causas", exact: true }).click();
  await expect(panel.getByText(/esta respuesta no acredita ausencia de causas/)).toBeVisible();
  await expect(panel.getByRole("button", { name: /Importar/ })).toHaveCount(0);
});

test("error recuperable y acceso remoto sin apertura de navegador ni formulario de contraseña", async ({ page }) => {
  let unavailable = true; let posts = 0;
  await page.route("**/api/pjud/manual-session", async route => {
    if (route.request().method() === "POST") posts++;
    await route.fulfill(unavailable ? { status: 503, json: { error: "Estado ficticio temporalmente no disponible." } } : { json: { capabilities: { ...capabilities, available: false, hostLocal: false, reason: "Abra LexOpen en el equipo Host para utilizar el ingreso manual." }, session: null } });
  });
  const panel = await openPanel(page);
  await expect(panel.getByRole("alert")).toContainText("Estado ficticio temporalmente no disponible.");
  unavailable = false;
  await panel.getByRole("button", { name: "Actualizar estado", exact: true }).click();
  await expect(panel.getByText("Abra LexOpen en el equipo Host para utilizar el ingreso manual.", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Ingresar con ClaveÚnica", exact: true })).toBeDisabled();
  await expect(panel.locator('input[type="password"]')).toHaveCount(0);
  expect(posts).toBe(0);
});

test("al perder autorización desaparecen el listado privado y la selección", async ({ page }) => {
  await page.clock.install();
  let allowed = true;
  const current = session({ listedAt: "2026-11-03T18:00:00Z", materiasTried: ["Civil"], candidates: candidates() });
  await page.route("**/api/pjud/manual-session", async route => {
    await route.fulfill(allowed ? { json: { capabilities, session: current } } : { status: 403, json: { error: "Permiso revocado en la prueba ficticia." } });
  });
  const panel = await openPanel(page);
  await panel.locator(".pjud-manual-case-list input").first().check();
  await expect(panel.getByRole("list", { name: "Causas seleccionadas" })).toBeVisible();
  allowed = false;
  await page.clock.runFor(10_500);
  await expect(panel.getByRole("alert")).toContainText("no tiene permiso");
  await expect(panel.getByText("Causa ficticia para revisión 1", { exact: true })).toHaveCount(0);
  await expect(panel.getByRole("list", { name: "Causas seleccionadas" })).toHaveCount(0);
});

test("un fallo al mostrar la ventana conserva la selección y el recibo sin reiniciar el ingreso", async ({ page }) => {
  const current = session({ phase: "completed", listedAt: "2026-11-03T18:00:00Z", materiasTried: ["Civil"], candidates: candidates(),
    result: { created: 1, linked: 0, syncOk: 1, syncFailed: 0, syncPartial: 0, inserted: 14, items: [
      { causaId: "fictitious-cause-a", rit: "C-100-2024", tribunal: "1º Juzgado Civil de Santiago", status: "ok", cuadernosCoverage: coverage },
    ] } });
  const payloads: Record<string, unknown>[] = [];
  await page.route("**/api/pjud/manual-session", async route => {
    if (route.request().method() === "POST") {
      payloads.push(route.request().postDataJSON());
      await route.fulfill({ status: 503, json: { error: "La ventana temporal no pudo activarse en esta prueba ficticia." } });
    } else await route.fulfill({ json: { capabilities, session: current } });
  });
  const panel = await openPanel(page);
  await panel.getByRole("button", { name: "Continuar con otras causas de este listado", exact: true }).click();
  await panel.locator(".pjud-manual-case-list input").first().check();
  await panel.getByLabel("Filtrar el listado").fill("revisión 2");
  await panel.getByRole("button", { name: "Mostrar ventana oficial", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("La ventana temporal no pudo activarse");
  await expect(panel.getByLabel("Filtrar el listado")).toHaveValue("revisión 2");
  await expect(panel.getByRole("list", { name: "Causas seleccionadas" }).getByText("C-100-2024", { exact: true })).toBeVisible();
  await expect(panel.getByText("Recibo de la importación anterior", { exact: true })).toBeVisible();
  await expect(panel.getByRole("list", { name: "Pasos de incorporación" }).locator('[aria-current="step"]')).toContainText("Revisar las causas");
  await panel.getByText("Recibo de la importación anterior", { exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Resultado de la importación" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Ingresar con ClaveÚnica", exact: true })).toHaveCount(0);
  expect(payloads).toEqual([{ action: "focus", sessionId: "opaque-session-fixture" }]);
});

test("cambiar de sección conserva una importación aceptada y cierra la conexión de sólo lectura", async ({ page }) => {
  let closes = 0;
  let current = session({ phase: "importing", progress: { completed: 0, total: 1 } });
  await page.route("**/api/pjud/manual-session", async route => {
    if (route.request().method() === "POST" && route.request().postDataJSON().action === "close") { closes++; current = { ...current, phase: "closed" }; }
    await route.fulfill({ json: { capabilities, session: current } });
  });
  const panel = await openPanel(page);
  await expect(panel.getByRole("heading", { name: "Recuperando los cuadernos de sus causas" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Mostrar ventana oficial", exact: true })).toHaveCount(0);
  await panel.getByRole("link", { name: "Consultar por RIT/ROL", exact: true }).click();
  await expect(page).toHaveURL(/\/causas\/monitoreo/);
  expect(closes).toBe(0);
  current = session();
  await page.getByRole("navigation", { name: "Apartado causas" }).getByRole("link", { name: "ClaveÚnica", exact: true }).click();
  const returned = page.getByRole("region", { name: "Su cuenta judicial, su cartera", exact: true });
  await expect(returned.getByRole("button", { name: "Consultar Mis Causas", exact: true })).toBeVisible();
  await returned.getByRole("link", { name: "Consultar por RIT/ROL", exact: true }).click();
  await expect.poll(() => closes).toBe(1);
});
