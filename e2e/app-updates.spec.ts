import { expect, test } from "@playwright/test";
import { apiRequest, loginAs } from "./helpers";
import { CSRF_COOKIE, CSRF_HEADER } from "../src/lib/auth/csrf-constants";
import type { SelfUpdateStatus } from "../src/lib/self-update";

// Route fixtures must see requests before the application's service worker.
test.use({ serviceWorkers: "block" });
test.setTimeout(60_000);

test("actualizaciones: autenticación y permisos impiden administrar el Host", async ({ page }) => {
  expect((await page.request.get("/api/admin/self-update")).status()).toBe(401);
  expect((await page.request.get("/api/admin/update-check")).status()).toBe(401);
  await loginAs(page, "abogado@estudio.cl");
  expect((await page.request.get("/api/admin/self-update")).status()).toBe(403);
  expect((await apiRequest(page).post("/api/admin/self-update", { data: { action: "start" } })).status()).toBe(403);
  expect((await page.request.get("/api/admin/update-check")).status()).toBe(200);
  await page.goto("/configuracion#host-status");
  await expect(page.getByTestId("self-update-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Buscar y actualizar", exact: true })).toHaveCount(0);
});

test("actualizaciones: el Host no administrado explica la limitación y no ofrece actualizar", async ({ page }, info) => {
  await loginAs(page, "socio@estudio.cl");
  const response = await page.request.get("/api/admin/self-update");
  expect(response.ok()).toBeTruthy();
  const status = await response.json();
  // Fail before any POST if this test were accidentally pointed at a managed Host.
  expect(status.available).toBe(false);
  expect(status.webHostManaged).toBe(false);
  expect(status.reason).toEqual(expect.any(String));
  expect(status.reason.length).toBeGreaterThan(0);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const deniedOrigin = await apiRequest(page).post("/api/admin/self-update", {
    data: { action: "start" }, headers: { Origin: "https://foreign.example.invalid" },
  });
  expect(deniedOrigin.status()).toBe(403);
  if (process.env.E2E_SERVER_MODE === "production") {
    expect((await page.request.post("/api/admin/self-update", { data: { action: "start" }, headers: { Origin: new URL(page.url()).origin } })).status()).toBe(403);
  }
  const denied = await apiRequest(page).post("/api/admin/self-update", { data: { action: "start" } });
  expect(denied.status()).toBe(409);
  expect((await denied.json()).error).toBe(status.reason);

  // Only the release notice is simulated. Capability and mutation rejection
  // above, and the capability rendered by the real settings page, remain real.
  await page.route("**/api/admin/update-check", route => route.fulfill({ json: {
    updateAvailable: true, currentVersion: status.currentVersion, latestVersion: "9.9.9",
    releaseUrl: "https://github.com/gabrielperezibacache/lexopen/releases", disabled: false,
  } }));
  await page.goto("/configuracion#host-status");
  const panel = page.getByTestId("self-update-panel");
  await expect(panel).toContainText(status.reason);
  await expect(page.getByRole("button", { name: "Actualizar ahora", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Buscar y actualizar", exact: true })).toHaveCount(0);
  await expect(page.getByText("Puede actualizar desde aquí sin salir de LexOpen. Los datos del estudio se conservan.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Pasos manuales", exact: true }).click();
  await expect(page.getByRole("link", { name: "Abrir guía de actualización", exact: true })).toHaveAttribute("href", "https://github.com/gabrielperezibacache/lexopen/blob/main/docs/ACTUALIZACIONES.md");
  for (const [width, height] of [[1440, 1000], [360, 800]] as const) {
    await page.setViewportSize({ width, height });
    await panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await panel.evaluate(element => {
      const nav = document.querySelector('nav[aria-label="Secciones de configuración"]');
      window.scrollBy({ top: element.getBoundingClientRect().top - (nav?.getBoundingClientRect().bottom || 0) - 16, behavior: "instant" });
    });
    await page.screenshot({ path: info.outputPath(`host-unmanaged-${width}.png`) });
  }
});

test("actualizaciones: configuración sincroniza aviso y panel, conserva recibos y bloquea recuperación", async ({ page }, info) => {
  await loginAs(page, "socio@estudio.cl");
  const original = await (await page.request.get("/api/admin/self-update")).json();
  let updateAvailable = true, latestVersion = "1.1.0", writes = 0;
  let status: SelfUpdateStatus = {
    ...original, phase: "idle", ok: false, available: true, webHostManaged: true,
    currentVersion: "1.0.0", recoveryRequired: false, reason: undefined, message: "", error: null,
  };
  // These two explicit HTTP fixtures simulate the update lifecycle. Every POST
  // is intercepted: this test never queues code changes or an actual installer.
  await page.route("**/api/admin/update-check", route => route.fulfill({ json: {
    updateAvailable, currentVersion: status.currentVersion, latestVersion, disabled: false,
  } }));
  await page.route("**/api/admin/self-update", async route => {
    if (route.request().method() === "POST") {
      writes++;
      const origin = new URL(page.url()).origin;
      const token = (await page.context().cookies(origin)).find(cookie => cookie.name === CSRF_COOKIE)?.value;
      expect(token).toBeTruthy();
      expect(route.request().headers()[CSRF_HEADER]).toBe(token);
      expect(route.request().headers().origin).toBe(origin);
      expect(route.request().postDataJSON()).toEqual({ action: "start" });
      status = { ...status, phase: "queued", message: "Actualización ficticia en cola" };
      // The Host may stop after queuing, before the browser receives the reply.
      // Both widgets must recover by GET and must never retry this POST.
      await route.abort("connectionreset");
    } else {
      await route.fulfill({ json: { ...status, updateAvailable, latestVersion } });
    }
  });
  await page.goto("/configuracion#host-status");
  const panel = page.getByTestId("self-update-panel");
  await expect(panel.getByRole("button", { name: "Actualizar ahora", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Actualizar ahora", exact: true })).toHaveCount(2);
  await panel.getByRole("button", { name: "Actualizar ahora", exact: true }).click();
  await expect(panel).toContainText("Actualización ficticia en cola");
  await expect(page.getByRole("button", { name: "Actualizar ahora", exact: true })).toHaveCount(0);
  status = { ...status, phase: "awaiting_restart", message: "Reinicio ficticio pendiente de comprobar" };
  await expect(panel).toContainText(status.message!, { timeout: 15_000 });
  status = { ...status, phase: "done", ok: true, currentVersion: "1.1.0", message: "Actualización ficticia comprobada" };
  await expect(panel).toContainText(status.message!, { timeout: 15_000 });
  await expect(panel.getByRole("button", { name: "Recargar aplicación", exact: true })).toBeVisible();
  expect(writes).toBe(1);

  latestVersion = "1.2.0";
  await page.reload();
  await expect(panel.getByRole("button", { name: "Actualizar ahora", exact: true })).toBeEnabled();
  await expect(page.getByText("v1.2.0", { exact: true })).toBeVisible();
  await expect(page.getByText("LexOpen se actualizó correctamente", { exact: true })).toHaveCount(0);

  updateAvailable = false;
  status = { ...status, phase: "failed", ok: false, recoveryRequired: true, message: "Conserve el respaldo ficticio", error: "No se confirmó el reinicio ficticio" };
  await page.reload();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Buscar y actualizar", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Actualizar ahora", exact: true })).toHaveCount(0);
  expect(writes).toBe(1);
  await page.setViewportSize({ width: 360, height: 800 });
  await panel.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await panel.evaluate(element => {
    const nav = document.querySelector('nav[aria-label="Secciones de configuración"]');
    window.scrollBy({ top: element.getBoundingClientRect().top - (nav?.getBoundingClientRect().bottom || 0) - 16, behavior: "instant" });
  });
  await page.screenshot({ path: info.outputPath("update-recovery-mobile.png") });
});
