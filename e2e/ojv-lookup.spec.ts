import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { loginAs } from "./helpers";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";

// This suite uses only disposable seeded accounts and fictitious intercepted OJV data.
// It never invokes a real OJV provider, CAPTCHA service or studio credentials.
assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
let sessionCookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
const tribunal = "1º Juzgado Civil de Santiago";
const queriedAt = "2026-11-03T15:30:00.000Z";
const catalogue = {
  tribunales: [tribunal, "2º Juzgado Civil de Santiago"],
  count: 2,
  capabilities: { preview: true, byRut: true, create: true },
  readiness: { configured: true, channel: "sidecar", note: "Canal configurado. Su disponibilidad se comprueba al consultar." },
};
const preview = {
  identity: { rit: "C-100-2024", tribunal },
  queriedAt,
  provider: "sidecar-ficticio-e2e",
  count: 2,
  sala: "Sala de prueba",
  note: "Datos ficticios de consulta para esta prueba.",
  coverage: { scope: "returned-records", complete: false, note: "La lista puede ser parcial." },
  cuadernos: { status: "partial", total: 3, read: 2, items: [
    { key: "cuaderno:1.0", label: "1.0 - Principal", status: "ok", count: 1 },
    { key: "cuaderno:1.1", label: "1.1 - Apremio ficticio", status: "ok", count: 1 },
    { key: "cuaderno:2.0", label: "2.0 - Cuaderno ficticio pendiente", status: "failed", count: 0, note: "La fuente ficticia no respondió para este cuaderno." },
  ] },
  sample: [
    { titulo: "Resolución ficticia de prueba", fecha: "2026-11-02", cuaderno: "Principal", esReceptor: false },
    { titulo: "Notificación ficticia de prueba", fecha: "2026-10-30", cuaderno: "Apremio", esReceptor: true },
  ],
};

type Payload = { action: string; rit?: string; tribunal?: string; titulo?: string; rut?: string; syncNow?: boolean };
async function interceptLookup(page: Page, post: (route: Route, body: Payload) => Promise<void>, get = catalogue) {
  await page.route("**/api/pjud/lookup", async route => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: get });
      return;
    }
    await post(route, route.request().postDataJSON() as Payload);
  });
}
async function openLookup(page: Page) {
  await page.goto("/causas/monitoreo?alta=1");
  const panel = page.getByRole("region", { name: "Consultar en OJV", exact: true });
  await expect(panel).toBeVisible();
  return panel;
}
async function fillRol(page: Page) {
  const panel = page.getByRole("region", { name: "Consultar en OJV", exact: true });
  await panel.getByRole("textbox", { name: /^RIT \/ ROL/ }).fill("C-100-2024");
  await panel.getByRole("combobox", { name: /^Tribunal/ }).fill(tribunal);
  return panel;
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ locale: "es-CL" });
  try {
    await loginAs(await context.newPage(), "socio@estudio.cl");
    sessionCookies = await context.cookies();
  } finally {
    await context.close();
  }
});
test.beforeEach(async ({ context, page }) => {
  await context.addCookies(sessionCookies);
  await page.route("**/api/pjud/manual-session", route => route.fulfill({ json: { capabilities: { available: false, allowed: true, hostLocal: true, reason: "Ingreso manual no habilitado en esta prueba ficticia del acceso guardado.", importLimit: 20 }, session: null } }));
});

test("la consulta es de sólo lectura y el registro se confirma por separado", async ({ page }, info) => {
  const payloads: Payload[] = [];
  await interceptLookup(page, async (route, body) => {
    payloads.push(body);
    await route.fulfill({ json: body.action === "preview-rol" ? preview : { note: "Registro ficticio confirmado." } });
  });
  await openLookup(page);
  const panel = await fillRol(page);
  await panel.getByRole("textbox", { name: /^Carátula/ }).fill("Carátula ficticia preservada");
  await panel.getByRole("button", { name: "Consultar movimientos", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Resultado de la consulta" })).toBeVisible();
  expect(payloads).toEqual([{ action: "preview-rol", rit: "C-100-2024", tribunal }]);
  await expect(panel.getByText("2 movimientos recuperados", { exact: true })).toBeVisible();
  await expect(panel.getByText("sidecar-ficticio-e2e", { exact: true })).toBeVisible();
  await expect(panel.getByText("Cuaderno: Apremio · Actuación de receptor", { exact: true })).toBeVisible();
  await expect(panel.getByText(/La lista puede ser parcial/)).toBeVisible();
  await expect(panel.getByText("Fecha no informada", { exact: true })).toHaveCount(0);
  await expect(panel.getByRole("textbox", { name: /^Carátula/ })).toHaveValue("Carátula ficticia preservada");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
  await page.screenshot({ path: info.outputPath("ojv-lookup-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  for (const control of await panel.locator("button, input, summary").all()) {
    if (await control.isVisible()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
  await page.screenshot({ path: info.outputPath("ojv-lookup-mobile.png"), fullPage: true });
  await panel.getByRole("button", { name: "Agregar a mi cartera", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Registro ficticio confirmado.");
  expect(payloads[1]).toEqual({ action: "add-rol", rit: "C-100-2024", tribunal, titulo: "Carátula ficticia preservada", syncNow: true });
});

test("editar criterios invalida la consulta y conserva ambos formularios al cambiar de modo", async ({ page }) => {
  const payloads: Payload[] = [];
  await interceptLookup(page, async (route, body) => {
    payloads.push(body);
    await route.fulfill({ json: body.action === "buscar-rut"
      ? { causas: [{ rit: "C-200-2024", tribunal, caratula: "Litigantes ficticios" }], count: 1, queriedAt, note: "Lista ficticia parcial." }
      : { ...preview, identity: { rit: body.rit, tribunal: body.tribunal } } });
  });
  const panel = await openLookup(page);
  await fillRol(page);
  await panel.getByRole("button", { name: "Consultar movimientos", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Resultado de la consulta" })).toBeVisible();
  await panel.getByRole("textbox", { name: /^RIT \/ ROL/ }).fill("C-101-2024");
  await expect(panel.getByRole("heading", { name: "Resultado de la consulta" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Agregar a mi cartera", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Por RUT", exact: true }).click();
  await panel.getByRole("textbox", { name: "RUT del litigante" }).fill("11.111.111-1");
  await panel.getByRole("button", { name: "Buscar causas por RUT", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "1 causa recibida", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Por RIT / ROL", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: /^RIT \/ ROL/ })).toHaveValue("C-101-2024");
  await expect(panel.getByRole("combobox", { name: /^Tribunal/ })).toHaveValue(tribunal);
  await panel.getByRole("button", { name: "Por RUT", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "RUT del litigante" })).toHaveValue("11.111.111-1");
  await expect(panel.getByText("Litigantes ficticios", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Consultar movimientos de C-200-2024", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: /^RIT \/ ROL/ })).toHaveValue("C-200-2024");
  await expect(panel.getByRole("heading", { name: "Resultado de la consulta" })).toBeVisible();
  expect(payloads.every(body => body.action !== "add-rol")).toBeTruthy();
});

test("error recuperable, consulta vacía y registro sin consultar tienen estados distintos", async ({ page }) => {
  let attempts = 0;
  const payloads: Payload[] = [];
  await interceptLookup(page, async (route, body) => {
    payloads.push(body);
    if (body.action === "add-rol") { await route.fulfill({ json: { note: "Registro ficticio sin sincronización." } }); return; }
    attempts++;
    if (attempts === 1) { await route.fulfill({ status: 503, json: { error: "La OJV de prueba no responde. Vuelva a intentarlo." } }); return; }
    await route.fulfill({ json: { ...preview, count: 0, sample: [] } });
  });
  const panel = await openLookup(page);
  await fillRol(page);
  await panel.getByRole("button", { name: "Consultar movimientos", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("La OJV de prueba no responde.");
  await expect(panel.getByRole("textbox", { name: /^RIT \/ ROL/ })).toHaveValue("C-100-2024");
  await panel.getByRole("button", { name: "Volver a consultar", exact: true }).click();
  await expect(panel.getByText("0 movimientos recuperados", { exact: true })).toBeVisible();
  await expect(panel.getByText(/Esto no confirma que la causa no exista/)).toBeVisible();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await panel.getByRole("combobox", { name: /^Tribunal/ }).fill("2º Juzgado Civil de Santiago");
  await panel.getByText("Registrar sin consulta previa", { exact: true }).click();
  await panel.getByRole("button", { name: "Registrar sin consultar OJV", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Registro ficticio sin sincronización.");
  expect(payloads.at(-1)).toEqual({ action: "add-rol", rit: "C-100-2024", tribunal: "2º Juzgado Civil de Santiago", syncNow: false });
});

test("la validación es accesible y las sugerencias fallidas pueden reintentarse sin perder criterios", async ({ page }) => {
  let suggestionsAvailable = false;
  let postAttempts = 0;
  await page.route("**/api/pjud/lookup", async route => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: suggestionsAvailable ? 200 : 503, json: suggestionsAvailable ? catalogue : { error: "Fallo de prueba" } });
    } else { postAttempts++; await route.fulfill({ json: preview }); }
  });
  const panel = await openLookup(page);
  await panel.getByRole("button", { name: "Consultar movimientos", exact: true }).click();
  const ritInput = panel.getByRole("textbox", { name: /^RIT \/ ROL/ });
  await expect(ritInput).toHaveAttribute("aria-invalid", "true");
  await expect(ritInput).toBeFocused();
  await expect(panel.getByText("Ingrese un RIT/ROL válido, por ejemplo C-100-2024.", { exact: true })).toBeVisible();
  expect(postAttempts).toBe(0);
  await fillRol(page);
  suggestionsAvailable = true;
  await panel.getByRole("button", { name: "Reintentar sugerencias", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Reintentar sugerencias", exact: true })).toHaveCount(0);
  await expect(ritInput).toHaveValue("C-100-2024");
  await expect(panel.getByRole("combobox", { name: /^Tribunal/ })).toHaveValue(tribunal);
  await expect(ritInput).toHaveAttribute("maxlength", "40");
  await expect(panel.getByRole("combobox", { name: /^Tribunal/ })).toHaveAttribute("maxlength", "255");
  await expect(panel.getByRole("textbox", { name: /^Carátula/ })).toHaveAttribute("maxlength", "500");
});

test("cancelar evita respuestas obsoletas y bloquea consultas concurrentes", async ({ page }) => {
  let attempts = 0;
  let resolveFirst!: () => void;
  const firstPending = new Promise<void>(resolve => { resolveFirst = resolve; });
  await interceptLookup(page, async (route) => {
    attempts++;
    if (attempts === 1) await firstPending;
    await route.fulfill({ json: preview }).catch(() => undefined);
  });
  const panel = await openLookup(page);
  await fillRol(page);
  const consult = panel.getByRole("button", { name: "Consultar movimientos", exact: true });
  await consult.dblclick();
  await expect(panel.getByRole("button", { name: "Consultando OJV…", exact: true })).toBeDisabled();
  await expect.poll(() => attempts).toBe(1);
  await panel.getByRole("button", { name: "Cancelar consulta", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Consulta cancelada.");
  await panel.getByRole("textbox", { name: /^RIT \/ ROL/ }).fill("C-101-2024");
  resolveFirst();
  await expect(panel.getByRole("heading", { name: "Resultado de la consulta" })).toHaveCount(0);
  await consult.click();
  await expect(panel.getByRole("heading", { name: "Resultado de la consulta" })).toBeVisible();
  expect(attempts).toBe(2);
});

test("un canal no configurado y el permiso de registro se explican sin simular resultados", async ({ page }) => {
  let postAttempts = 0;
  await interceptLookup(page, async route => { postAttempts++; await route.fulfill({ json: preview }); }, {
    ...catalogue,
    capabilities: { preview: false, byRut: false, create: false },
    readiness: { configured: false, channel: "unconfigured", note: "La consulta OJV requiere preparación del servidor." },
  });
  const panel = await openLookup(page);
  await expect(panel.getByText("La consulta OJV requiere preparación del servidor.", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Consultar movimientos", exact: true })).toBeDisabled();
  await panel.getByText("Registrar sin consulta previa", { exact: true }).click();
  await expect(panel.getByText(/no tiene permiso para registrar causas/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Registrar sin consultar OJV", exact: true })).toBeDisabled();
  expect(postAttempts).toBe(0);
});


test("RUT inválido, error del proveedor y búsqueda vacía conservan su significado", async ({ page }) => {
  let attempts = 0;
  await interceptLookup(page, async route => {
    attempts++;
    if (attempts === 1) { await route.fulfill({ status: 503, json: { error: "Búsqueda OJV de prueba interrumpida." } }); return; }
    await route.fulfill({ json: { causas: [], count: 0, queriedAt, note: "Respuesta ficticia sin coincidencias." } });
  });
  const panel = await openLookup(page);
  await panel.getByRole("button", { name: "Por RUT", exact: true }).click();
  const rut = panel.getByRole("textbox", { name: "RUT del litigante" });
  await rut.fill("11.111.111-2");
  await panel.getByRole("button", { name: "Buscar causas por RUT", exact: true }).click();
  await expect(rut).toHaveAttribute("aria-invalid", "true");
  await expect(rut).toBeFocused();
  expect(attempts).toBe(0);
  await rut.fill("11.111.111-1");
  await panel.getByRole("button", { name: "Buscar causas por RUT", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Búsqueda OJV de prueba interrumpida.");
  await expect(panel.getByRole("heading", { name: "0 causas recibidas", exact: true })).toHaveCount(0);
  await expect(rut).toHaveValue("11.111.111-1");
  await panel.getByRole("button", { name: "Buscar causas por RUT", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "0 causas recibidas", exact: true })).toBeVisible();
  await expect(panel.getByText(/La búsqueda no acredita ausencia de causas/)).toBeVisible();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  expect(attempts).toBe(2);
});

const cuReadyStatus = {
  enabled: true,
  rutMasked: "11.***.***-*",
  hasPassword: true,
  lastSyncAt: null as string | null,
  lastSyncStatus: null as string | null,
  lastSyncNote: null as string | null,
  scrapeFlag: true,
  sidecar: true,
  sidecarReachable: true,
  publicScrape: false,
  captchaConfigured: true,
  readyToSync: true,
  blockers: [] as string[],
  warnings: [] as string[],
  readinessLabel: "Canal de prueba disponible",
  readinessHint: "Datos de estado ficticios; no se consulta OJV real.",
  channelLabel: "Proveedor ficticio de pruebas",
};

test("ClaveÚnica distingue carga fallida de acceso ausente y recupera permisos del socio", async ({ page }) => {
  let gets = 0;
  await page.route("**/api/pjud/mis-causas", async route => {
    gets++;
    await route.fulfill({ status: gets === 1 ? 503 : 200, json: gets === 1
      ? { error: "No se pudo comprobar el estado de prueba." }
      : { status: cuReadyStatus, causasCount: 3, causas: [], capabilities: { sync: true, credentials: false } } });
  });
  await page.goto("/causas/mis-causas");
  await page.getByText("Acceso guardado del estudio y sincronización programada", { exact: true }).click();
  const surface = page.locator(".pjud-cu");
  await expect(surface.getByRole("alert")).toContainText("No se pudo comprobar el estado de prueba.");
  await expect(surface.getByText("Estado sin comprobar", { exact: true })).toBeVisible();
  await expect(surface.getByText("Acceso: sin guardar", { exact: true })).toHaveCount(0);
  await expect(surface.getByText("Conexión: pausada", { exact: true })).toHaveCount(0);
  await surface.getByRole("button", { name: "Volver a consultar estado", exact: true }).click();
  await expect(surface.getByRole("button", { name: "Sincronizar ahora", exact: true })).toBeEnabled();
  await expect(surface.getByRole("button", { name: "Guardar de forma segura", exact: true })).toBeDisabled();
  await expect(surface.getByRole("textbox", { name: "RUT", exact: true })).toBeDisabled();
  await expect(surface.getByRole("heading", { name: "3 causas vinculadas desde ClaveÚnica", exact: true })).toBeVisible();
  await expect(surface.getByRole("alert")).toHaveCount(0);
});

test("ClaveÚnica guarda sólo datos ficticios, limpia contraseña y distingue vacío de sincronización parcial", async ({ page }, info) => {
  let status = { ...cuReadyStatus, hasPassword: false };
  let synchronizations = 0;
  const saved: unknown[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/auth/me", route => route.fulfill({ json: { user: { role: "admin", name: "Administrador ficticio" } } }));
  await page.route("**/api/pjud/claveunica", async route => {
    saved.push(route.request().postDataJSON());
    status = { ...status, hasPassword: true };
    await route.fulfill({ json: status });
  });
  await page.route("**/api/pjud/mis-causas", async route => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { status, causasCount: synchronizations > 1 ? 1 : 0, causas: [], capabilities: { sync: true, credentials: true } } });
      return;
    }
    synchronizations++;
    status = { ...status, lastSyncAt: queriedAt, lastSyncStatus: synchronizations === 1 ? "ok" : "partial", lastSyncNote: synchronizations === 1 ? "Listado ficticio vacío." : "Consulta ficticia parcial: un movimiento pendiente." };
    await route.fulfill({ json: {
      status, listed: synchronizations === 1 ? 0 : 1, created: synchronizations === 1 ? 0 : 1, linked: 0,
      syncFailed: synchronizations === 1 ? 0 : 1,
      items: synchronizations === 1 ? [] : [{ rit: "C-300-2024", tribunal, caratula: "Carátula ficticia para comprobar la recuperación parcial de una causa" }],
    } });
  });
  await page.goto("/causas/mis-causas");
  await page.getByText("Acceso guardado del estudio y sincronización programada", { exact: true }).click();
  const surface = page.locator(".pjud-cu");
  await expect(surface.getByRole("button", { name: "Guardar de forma segura", exact: true })).toBeEnabled();
  await surface.getByRole("textbox", { name: "RUT", exact: true }).fill("11.111.111-1");
  await surface.getByLabel("Contraseña", { exact: true }).fill("clave-ficticia-e2e");
  await surface.getByRole("button", { name: "Guardar de forma segura", exact: true }).click();
  await expect(surface.getByTestId("claveunica-msg")).toContainText("guardarla no confirma que sea correcta");
  await expect(surface.getByLabel("Contraseña", { exact: true })).toHaveValue("");
  expect(saved).toEqual([{ action: "save", rut: "11.111.111-1", password: "clave-ficticia-e2e" }]);
  await surface.getByRole("button", { name: "Sincronizar ahora", exact: true }).click();
  await expect(surface.getByTestId("claveunica-msg")).toContainText("Esto no acredita que su cuenta no tenga causas.");
  await expect(surface.getByText(/Todo al día/)).toHaveCount(0);
  await expect(surface.getByText(/No se recibieron causas en esta sincronización/)).toBeVisible();
  await surface.getByRole("button", { name: "Sincronizar ahora", exact: true }).click();
  await expect(surface.getByTestId("claveunica-msg")).toHaveAttribute("data-tone", "warn");
  await expect(surface.getByTestId("claveunica-msg")).toContainText("1 causa no pudo actualizar sus movimientos.");
  await expect(surface.getByText("C-300-2024", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
  await page.screenshot({ path: info.outputPath("claveunica-partial-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  for (const control of await surface.locator("button, input").all()) {
    if (await control.isVisible()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
  await page.screenshot({ path: info.outputPath("claveunica-partial-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("ClaveÚnica respeta permisos efectivos y deja de consultar al abandonar una sincronización", async ({ page }) => {
  let syncRequests = 0;
  let pollingGets = 0;
  await page.clock.install();
  await page.route("**/api/auth/me", route => route.fulfill({ json: { user: { role: "abogado", name: "Profesional ficticio con permiso concedido" } } }));
  await page.route("**/api/pjud/mis-causas", async route => {
    if (route.request().method() === "POST") {
      syncRequests++;
      await route.fulfill({ status: 202, json: { async: true, started: false, status: { ...cuReadyStatus, lastSyncStatus: "running" } } });
      return;
    }
    if (syncRequests > 0) pollingGets++;
    await route.fulfill({ json: {
      status: { ...cuReadyStatus, lastSyncStatus: syncRequests === 1 ? "partial" : null, lastSyncNote: syncRequests === 1 ? "Resultado ficticio parcial comprobado." : null },
      causasCount: 1, causas: [], capabilities: { sync: true, credentials: false },
    } });
  });
  await page.goto("/causas/mis-causas");
  await page.getByText("Acceso guardado del estudio y sincronización programada", { exact: true }).click();
  const surface = page.locator(".pjud-cu");
  await expect(surface.getByRole("button", { name: "Sincronizar ahora", exact: true })).toBeEnabled();
  await expect(surface.getByRole("button", { name: "Guardar de forma segura", exact: true })).toBeDisabled();
  await surface.getByRole("button", { name: "Sincronizar ahora", exact: true }).click();
  await expect(surface.getByRole("button", { name: "Sincronizando…", exact: true })).toBeDisabled();
  await page.clock.runFor(3100);
  await expect(surface.getByTestId("claveunica-msg")).toContainText("Resultado ficticio parcial comprobado.");
  await expect(surface.getByTestId("claveunica-msg")).toHaveAttribute("data-tone", "warn");
  await surface.getByRole("button", { name: "Sincronizar ahora", exact: true }).click();
  await expect(surface.getByRole("button", { name: "Sincronizando…", exact: true })).toBeDisabled();
  await page.goto("/causas");
  const previousGets = pollingGets;
  await page.clock.runFor(10000);
  expect(pollingGets).toBe(previousGets);
  expect(syncRequests).toBe(2);
});
