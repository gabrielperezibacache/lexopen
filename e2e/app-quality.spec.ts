import { expect, test, type BrowserContext } from "@playwright/test";
import { loginAs, authenticateApiRequests, apiRequest } from "./helpers";

let sessionCookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ locale: "es-CL" });
  try {
    await loginAs(await context.newPage(), "socio@estudio.cl");
    sessionCookies = await context.cookies();
  } finally {
    await context.close();
  }
});
test.beforeEach(async ({ context }) => {
  await context.addCookies(sessionCookies);
});

test("los apartados principales cargan sin errores de servidor", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: /Redactar contestación laboral/ }).getByText("urgente", { exact: true })).toBeVisible();
  for (const route of [
    "/dashboard", "/sites", "/clientes", "/causas", "/correo", "/minutas",
    "/facturacion", "/facturacion/horas", "/facturacion/gastos", "/facturacion/facturas",
    "/facturacion/tarifas", "/facturacion/uf", "/facturacion/cuenta-corriente",
    "/tareas", "/calendario", "/buscar", "/mensajes", "/flujos", "/personas",
    "/documentos", "/plazos", "/jurisprudencia", "/agente", "/portal",
    "/integraciones", "/auditoria", "/configuracion", "/notificaciones", "/cuenta",
  ]) {
    const response = await page.goto(route);
    expect(response?.ok(), route).toBeTruthy();
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.locator("#main-content h1").first(), route).toBeVisible();
  }
});

test("menú móvil accesible, foco restaurado y preferencia de movimiento", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard");
  const drawer = page.locator("#lexopen-mobile-nav");
  await expect(drawer.locator(".." )).toHaveAttribute("inert", "");
  const open = page.getByRole("button", { name: "Abrir menú" });
  await open.click();
  await expect(page.getByRole("dialog", { name: "Menú" })).toBeVisible();
  await expect(page.locator("#main-content").locator("..")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await expect(drawer.locator("..")).toHaveAttribute("inert", "");
  await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("dashboard-mobile.png"), fullPage: true });

  await open.click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator("#main-content").locator("..")).not.toHaveAttribute("inert", "");
  await page.goto("/buscar");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(
    page.locator("#main-content").getByRole("searchbox", { name: "Buscar en LexOpen" })
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("search-desktop.png"), fullPage: true });
});

test.describe("estados de la búsqueda global", () => {
  test.use({ serviceWorkers: "block" });
  test("muestra solo coincidencias, un único vacío y permite reintentar una consulta fallida", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const queries: string[] = [];
    let fail = false;
    await page.route("**/api/search?*", route => {
      const q = new URL(route.request().url()).searchParams.get("q")!;
      queries.push(q);
      if (fail) return route.fulfill({ status: 503, json: { error: "Servicio temporalmente ocupado" } });
      return route.fulfill({ json: { q, jurisprudencia: q === "vacío" ? [] : [{ id: "1", rol: "R-10", caratula: "Sentencia de prueba" }] } });
    });
    await page.goto("/buscar");
    const main = page.getByRole("main");
    const input = main.getByRole("searchbox");
    await input.fill("referencia");
    await input.press("Enter");
    await expect(main.getByRole("heading", { level: 2 })).toHaveText(["Jurisprudencia"]);
    await expect(main.getByRole("link", { name: /Sentencia de prueba/ })).toHaveAttribute("href", "/jurisprudencia?q=R-10");
    await input.fill("vacío");
    await input.press("Enter");
    await expect(main.getByRole("status")).toHaveText("Sin resultados para esta búsqueda.");
    await expect(main.getByRole("heading", { level: 2 })).toHaveCount(0);
    fail = true;
    await input.fill("consulta original");
    await input.press("Enter");
    await expect(main.getByRole("alert")).toHaveText("Servicio temporalmente ocupado");
    await expect(main.getByText("Sin resultados para esta búsqueda.")).toHaveCount(0);
    await expect(input).toHaveValue("consulta original");
    fail = false;
    await main.getByRole("button", { name: "Reintentar" }).click();
    await expect(main.getByRole("link", { name: /Sentencia de prueba/ })).toBeVisible();
    expect(queries).toEqual(["referencia", "vacío", "consulta original", "consulta original"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test("búsqueda rechaza consultas excesivas y mantiene sincronizado el campo", async ({ page }) => {
  await page.goto("/dashboard");
  const response = await page.request.get(`/api/search?q=${"a".repeat(201)}`);
  expect(response.status()).toBe(400);
  await page.goto("/buscar");
  await page.getByRole("button", { name: "Andes", exact: true }).click();
  await expect(page.locator("#unified-search")).toHaveValue("Andes");
  await expect(page.getByRole("status")).toHaveText("Resultados para «Andes»");
});

test("una cookie con solo el ID del usuario no autentica", async ({ page, context }) => {
  await page.goto("/dashboard");
  const session = (await context.cookies()).find(cookie => cookie.name === "lexopen_session")!;
  expect(session.value.split(".")).toHaveLength(5);
  await context.addCookies([{ ...session, value: session.value.split(".")[0] }]);
  expect((await page.request.get("/api/search?q=andes")).status()).toBe(401);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?/);
});

test("el cambio de contraseña limita intentos por usuario", async ({ page }) => {
  await page.goto("/dashboard");
  await authenticateApiRequests(page);
  for (let i = 0; i < 10; i++) {
    const response = await apiRequest(page).post("/api/auth/password", {
      data: { currentPassword: "wrong-password", newPassword: "New-Audit-password-42" },
    });
    expect([401, 429]).toContain(response.status());
  }
  const limited = await apiRequest(page).post("/api/auth/password", {
    data: { currentPassword: "wrong-password", newPassword: "New-Audit-password-42" },
  });
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
});
