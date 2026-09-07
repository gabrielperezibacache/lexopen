import { expect, test, type BrowserContext } from "@playwright/test";
import { loginAs } from "./helpers";

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
  await expect(page.getByRole("searchbox", { name: "Buscar en LexOpen" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("search-desktop.png"), fullPage: true });
});

test("búsqueda rechaza consultas excesivas y mantiene sincronizado el campo", async ({ page }) => {
  await page.goto("/dashboard");
  const response = await page.request.get(`/api/search?q=${"a".repeat(201)}`);
  expect(response.status()).toBe(400);
  await page.goto("/buscar");
  await page.getByRole("button", { name: "Andes", exact: true }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("Andes");
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
  for (let i = 0; i < 10; i++) {
    const response = await page.request.post("/api/auth/password", {
      data: { currentPassword: "wrong-password", newPassword: "New-Audit-password-42" },
    });
    expect([401, 429]).toContain(response.status());
  }
  const limited = await page.request.post("/api/auth/password", {
    data: { currentPassword: "wrong-password", newPassword: "New-Audit-password-42" },
  });
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
});
