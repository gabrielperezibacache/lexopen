import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";
import { CSRF_COOKIE, CSRF_HEADER } from "../src/lib/auth/csrf-constants";

const legacyAnchors = ["idioma", "estudio", "usuarios", "transcription-settings", "llm-settings", "obsidian-settings", "google-settings", "notify-settings", "pjud-settings", "pjud-log", "runtime-settings", "integraciones-overview", "host-status", "purge-demo"];

test("Preferencias personales lleva directamente a la seguridad de la cuenta", async ({ page }, info) => {
  await loginAs(page, "abogado@estudio.cl");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/configuracion#cuenta-personal");
  const account = page.getByRole("region", { name: "Tu cuenta", exact: true });
  const security = account.getByRole("link", { name: /Contraseña y verificación/ });
  await expect(security).toBeVisible();
  for (const [width, height] of [[360, 800], [1440, 1000]] as const) {
    await page.setViewportSize({ width, height });
    await account.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`preferencias-${width}.png`) });
  }
  await security.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/cuenta#seguridad$/);
  await expect(page.getByRole("heading", { name: "Cambiar contraseña" })).toBeVisible();
});

test("ajustes móviles: categorías, ancla estable durante la carga y destinos antiguos", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loginAs(page, "socio@estudio.cl");
  const [modeResponse, countryResponse] = await Promise.all([
    page.request.get("/api/configuracion/causas"),
    page.request.get("/api/configuracion/pais"),
  ]);
  expect(modeResponse.ok() && countryResponse.ok()).toBeTruthy();
  const pjudEnabled = (await modeResponse.json()).mode === "pjud_cl";
  const communicationsEnabled = pjudEnabled || (await countryResponse.json()).country === "CL";
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
    await expect(category.locator("option")).toHaveCount(communicationsEnabled ? 7 : 6);
    const runtime = page.locator("#runtime-settings");
    await expect(runtime).toHaveCount(1);
    await expect(runtime).toContainText("Cargando");
    await runtime.evaluate(element => { element.setAttribute("data-retained-root", "yes"); });
    release();
    await expect(runtime).toContainText("Entorno y operación");
    await expect(runtime).toHaveAttribute("data-retained-root", "yes");
    for (const id of legacyAnchors) {
      const expected = ["pjud-settings", "pjud-log"].includes(id) && !pjudEnabled ? 0 : 1;
      await expect(page.locator(`[id="${id}"]`)).toHaveCount(expected);
    }
    await category.selectOption("conexiones-ia");
    await expect(page).toHaveURL(/#cuentas-conectadas$/);
    const nav = page.getByRole("navigation", { name: "Secciones de configuración" });
    await expect(nav.getByRole("link", { name: "Cuentas conectadas", exact: true })).toHaveAttribute("aria-current", "location");
    const accounts = page.getByRole("region", { name: "Cuentas conectadas", exact: true });
    await expect(accounts.getByRole("listitem")).toHaveCount(4);
    await expect(accounts.getByRole("link", { name: /Google Drive/ })).toHaveAttribute("href", "/inicio?altazor=connectors&connector=google");
    await expect(accounts.getByText("Busca y lee tus archivos autorizados de Drive, sin modificarlos.", { exact: true })).toBeVisible();
    await expect(accounts.getByRole("link", { name: /GitHub/ })).toHaveAttribute("href", "/inicio?altazor=connectors&connector=github");
    await expect(accounts.getByRole("link", { name: /Dropbox/ })).toHaveAttribute("href", "/inicio?altazor=connectors&connector=dropbox");
    await expect(accounts.getByRole("link", { name: /OneDrive · Microsoft 365/ })).toHaveAttribute("href", "/inicio?altazor=connectors&connector=microsoft");
    await nav.getByRole("link", { name: "IA", exact: true }).click();
    await expect(page).toHaveURL(/#llm-settings$/);
    await expect(nav.getByRole("link", { name: "IA", exact: true })).toHaveAttribute("aria-current", "location");
    await category.selectOption("estudio-equipo");
    await expect(page).toHaveURL(/#estudio$/);
    await page.goto("/configuracion#preferencias-altazor");
    await page.locator("#preferencias-altazor").getByRole("link", { name: "Cuentas conectadas", exact: true }).click();
    await expect(nav.getByRole("link", { name: "Cuentas conectadas", exact: true })).toHaveAttribute("aria-current", "location");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath("settings-categories-mobile.png"), fullPage: false });
  } finally { release(); }
});

test("el país muestra Comunicaciones de forma independiente de la modalidad PJUD", async ({ page }, info) => {
  test.slow();
  await loginAs(page, "socio@estudio.cl");
  const modePath = "/api/configuracion/causas", countryPath = "/api/configuracion/pais";
  const previousMode = await (await page.request.get(modePath)).json();
  const previousCountry = await (await page.request.get(countryPath)).json();
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === CSRF_COOKIE)?.value;
  expect(csrf).toBeTruthy();
  async function patch(path: string, data: object) {
    const response = await page.request.patch(path, { data, headers: { [CSRF_HEADER]: csrf!, origin: new URL(page.url()).origin } });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  try {
    await patch(modePath, { mode: "manual" });
    await patch(countryPath, { country: "AR" });
    const settingsMarkup = await page.request.get("/configuracion");
    expect(settingsMarkup.ok()).toBeTruthy();
    expect(await settingsMarkup.text()).not.toContain("claveUnicaPasswordEnc");
    await page.goto("/configuracion#work-country");
    const country = page.getByRole("combobox", { name: "País", exact: true });
    await expect(country).toHaveValue("AR");
    await expect(page.locator("#comunicaciones")).toHaveCount(0);
    await country.selectOption("CL");
    await page.getByRole("button", { name: "Guardar país" }).click();
    await expect(page.locator("#comunicaciones").getByRole("link", { name: "Configurar correo" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Gestión manual" })).toBeChecked();
    await page.getByRole("radio", { name: "Poder Judicial de Chile" }).check();
    await page.getByRole("button", { name: "Guardar modalidad" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Modalidad guardada" })).toBeVisible();
    await country.selectOption("AR");
    await page.getByRole("button", { name: "Guardar país" }).click();
    await expect(page.getByRole("status").filter({ hasText: "País de trabajo guardado" })).toBeVisible();
    await page.reload();
    await expect(country).toHaveValue("AR");
    await expect(page.locator("#comunicaciones")).toHaveCount(1);
    await expect(page.locator("#comunicaciones")).toBeVisible();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/configuracion#comunicaciones");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath("comunicaciones-movil.png") });
  } finally {
    await patch(countryPath, previousCountry);
    await patch(modePath, previousMode);
  }
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
  await expect(page).toHaveURL(/#cuentas-conectadas$/);
  await nav.getByRole("link", { name: "IA", exact: true }).click();
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
    await expect(nav.getByRole("link", { name: "Google del estudio", exact: true })).toHaveAttribute("aria-current", "location");
    await expect.poll(async () => form.evaluate(element => element.getBoundingClientRect().top)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  } finally { release(); }
});
