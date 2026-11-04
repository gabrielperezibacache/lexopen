import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

const legacyAnchors = ["idioma", "estudio", "usuarios", "transcription-settings", "llm-settings", "obsidian-settings", "google-settings", "notify-settings", "pjud-settings", "pjud-log", "runtime-settings", "integraciones-overview", "host-status", "purge-demo"];

test("ajustes móviles: cinco categorías, ancla estable durante la carga y destinos antiguos", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loginAs(page, "socio@estudio.cl");
  // This test controls the loading transition, rather than measuring the
  // independent Host diagnostics endpoint's response time under CI load.
  const snapshotResponse = await page.request.get("/api/admin/config-snapshot");
  expect(snapshotResponse.ok()).toBeTruthy();
  const snapshot = await snapshotResponse.body();
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/config-snapshot", async route => { await ready; await route.fulfill({ status: 200, contentType: "application/json", body: snapshot }); });
  try {
    await page.goto("/configuracion#runtime-settings");
    const category = page.getByRole("combobox", { name: "Categoría de configuración" });
    await expect(category).toHaveValue("aplicacion-datos");
    await expect(category.locator("option")).toHaveCount(5);
    const runtime = page.locator("#runtime-settings");
    await expect(runtime).toHaveCount(1);
    await expect(runtime).toContainText("Cargando");
    await runtime.evaluate(element => { element.setAttribute("data-retained-root", "yes"); });
    release();
    await expect(runtime).toContainText("Entorno y operación");
    await expect(runtime).toHaveAttribute("data-retained-root", "yes");
    for (const id of legacyAnchors) await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
    await category.selectOption("conexiones-ia");
    await expect(page).toHaveURL(/#llm-settings$/);
    const nav = page.getByRole("navigation", { name: "Secciones de configuración" });
    await expect(nav.getByRole("link", { name: "IA", exact: true })).toHaveAttribute("aria-current", "location");
    await category.selectOption("estudio-equipo");
    await expect(page).toHaveURL(/#estudio$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath("settings-categories-mobile.png"), fullPage: false });
  } finally { release(); }
});

test("ajustes: cambiar de categoría y usar atrás/adelante conserva campos y mensajes sin guardar", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loginAs(page, "socio@estudio.cl");
  await page.goto("/configuracion#estudio");
  const nav = page.getByRole("navigation", { name: "Secciones de configuración" });
  const name = page.locator('#estudio input[name="name"]');
  await name.fill("Edición ficticia sin guardar");
  // Exercise the real form feedback without changing even the fixture database.
  await page.route("**/api/configuracion", route => route.request().method() === "PATCH"
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Fallo ficticio de guardado" }) })
    : route.continue());
  const writes: string[] = [];
  page.on("request", request => { if (["POST", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url()); });
  await page.locator("#estudio").getByRole("button", { name: "Guardar configuración", exact: true }).click();
  await expect(page.locator("#estudio").getByRole("status")).toContainText("No se pudo guardar");
  await nav.getByRole("link", { name: "Conexiones e IA", exact: true }).click();
  await expect(page).toHaveURL(/#llm-settings$/);
  const key = page.getByTestId("llm-settings-form").locator('input[type="password"]').first();
  await key.fill("clave-ficticia-no-enviada");
  await nav.getByRole("link", { name: "Aplicación y datos", exact: true }).click();
  await expect(page).toHaveURL(/#idioma$/);
  await page.goBack();
  await expect(page).toHaveURL(/#llm-settings$/);
  await expect(nav.getByRole("link", { name: "IA", exact: true })).toHaveAttribute("aria-current", "location");
  await expect(key).toHaveValue("clave-ficticia-no-enviada");
  await expect(name).toHaveValue("Edición ficticia sin guardar");
  await expect(page.locator("#estudio").getByRole("status")).toContainText("No se pudo guardar");
  await page.goForward();
  await expect(page).toHaveURL(/#idioma$/);
  await expect(nav.getByRole("link", { name: "Idioma", exact: true })).toHaveAttribute("aria-current", "location");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatch(/\/api\/configuracion$/);
  await page.screenshot({ path: info.outputPath("settings-categories-desktop.png"), fullPage: false });
});

test("un enlace antiguo a Google se resuelve cuando termina de cargar su formulario", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loginAs(page, "socio@estudio.cl");
  const googleResponse = await page.request.get("/api/integrations/google");
  expect(googleResponse.ok()).toBeTruthy();
  const google = await googleResponse.body();
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/integrations/google", async route => { await ready; await route.fulfill({ status: 200, contentType: "application/json", body: google }); });
  try {
    await page.goto("/configuracion#google-settings");
    await expect(page.getByRole("combobox", { name: "Categoría de configuración" })).toHaveValue("conexiones-ia");
    release();
    const form = page.getByTestId("google-settings-form");
    await expect(form).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Secciones de configuración" });
    await expect(nav.getByRole("link", { name: "Google", exact: true })).toHaveAttribute("aria-current", "location");
    await expect.poll(async () => form.evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  } finally { release(); }
});
