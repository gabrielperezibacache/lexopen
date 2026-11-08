import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("Drive ofrece reutilizar la aplicación preparada y conserva la alternativa propia", async ({ page }, testInfo) => {
  const api = "/api/personal-connectors/google-drive";
  const callbackPath = `${api}/oauth/callback`;
  const saves: unknown[] = [];
  let source = "none", canReuseAltazorApp = true, accountStarts = 0;
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    return route.continue();
  });
  await page.route(`**${api}`, route => route.fulfill({ json: {
    connected: false, configured: source !== "none", canAdmin: true, label: "Mi cuenta de Google",
    email: null, connectionId: null, reason: null, lastVerifiedAt: null,
  } }));
  await page.route(`**${api}/setup`, route => {
    if (route.request().method() === "PUT") {
      saves.push(route.request().postDataJSON());
      source = "altazor";
    }
    return route.fulfill({ json: {
      configured: source !== "none", source, canEdit: true, canReuseAltazorApp, callbackPath,
      callbackUri: new URL(callbackPath, route.request().url()).href,
      reason: null, registrationUrl: "https://console.cloud.google.com/auth/clients",
    } });
  });
  page.on("request", request => { if (request.url().endsWith(`${api}/oauth/start`)) accountStarts++; });
  await loginAs(page, "socio@estudio.cl");
  const localSetup = await page.request.get(`${api}/setup`);
  expect(localSetup.ok()).toBe(true);
  expect(await localSetup.json()).toMatchObject({ canEdit: true });
  const remoteOrigin = await page.request.get(`${api}/setup`, { headers: { Origin: "https://remote.example.invalid" } });
  expect(remoteOrigin.ok()).toBe(true);
  expect(await remoteOrigin.json()).toMatchObject({
    canEdit: false, canReuseAltazorApp: false, reason: "Para preparar Google Drive, abre LexOpen en el equipo principal.",
  });
  await page.goto("/sincronizacion");
  const panel = page.getByRole("region", { name: "Mi cuenta de Google Drive" });
  await panel.getByText("Preparar conexión para el estudio", { exact: true }).click();
  const reuse = panel.getByRole("button", { name: "Usar la aplicación de Google Workspace", exact: true });
  await expect(reuse).toBeDisabled();
  await expect(panel.getByLabel("ID de cliente de Google", { exact: true })).toHaveCount(0);
  await expect(panel.getByText(/Conserva el retorno de Workspace y añade también el de Drive personal/)).toBeVisible();
  await expect(panel.locator("code")).toHaveText(new URL(callbackPath, page.url()).href);
  for (const [label, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await panel.screenshot({ path: testInfo.outputPath(`personal-drive-setup-${label}.png`) });
  }
  await panel.getByRole("button", { name: "Usar otra aplicación", exact: true }).click();
  await expect(panel.getByLabel("ID de cliente de Google", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Elegir la aplicación de Google Workspace", exact: true }).click();
  expect(saves).toEqual([]);
  await panel.getByRole("checkbox", { name: /Registré el retorno de Drive/ }).check();
  await reuse.click();
  await expect(panel.getByText("Aplicación preparada. Cada profesional puede autorizar su propia cuenta de Drive.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Conectar con Google", exact: true })).toBeVisible();
  expect(saves).toEqual([{ useAltazorApp: true, confirmed: true }]);
  expect(accountStarts).toBe(0);

  source = "saved";
  await page.reload();
  await panel.getByText("Configuración de la conexión", { exact: true }).click();
  await expect(panel.getByLabel("ID de cliente de Google", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Elegir la aplicación de Google Workspace", exact: true })).toBeVisible();
  expect(saves).toHaveLength(1);

  canReuseAltazorApp = false;
  await page.reload();
  await panel.getByText("Configuración de la conexión", { exact: true }).click();
  await expect(panel.getByLabel("ID de cliente de Google", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Elegir la aplicación de Google Workspace", exact: true })).toHaveCount(0);
});
