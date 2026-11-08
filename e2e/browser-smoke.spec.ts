import { expect, test } from "@playwright/test";
import { loginAs, authenticateApiRequests, apiRequest } from "./helpers";

test("formularios accesibles y menú móvil en el motor del navegador", async ({ page }) => {
  test.setTimeout(90_000);
  await loginAs(page, "abogado@estudio.cl");
  await page.goto("/clientes", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nuevo cliente", exact: true });
  await expect(dialog.getByRole("textbox", { name: "Razón social / nombre", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Nuevo cliente", exact: true })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  const open = page.getByRole("button", { name: "Abrir menú", exact: true });
  await open.click();
  await expect(page.getByRole("dialog", { name: "Menú", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.goto("/inicio", { waitUntil: "networkidle" });
  await expect(page.getByLabel("Archivos para adjuntar al mensaje de ALTAZOR", { exact: true })).toHaveAttribute("type", "file");
});

test("CSRF conserva el token actual de la página y protege las peticiones API tras renovarlo", async ({ page }) => {
  await loginAs(page, "abogado@estudio.cl");
  await authenticateApiRequests(page);
  const origin = new URL(page.url()).origin;
  await page.context().addCookies([{ name: "lexopen_csrf", value: "fictitious-browser-rotation-token", url: origin }]);
  const native = await page.evaluate(async () => {
    const token = document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith("lexopen_csrf="))!.slice(13);
    const send = (value: string) => fetch("/api/offline/sync", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": value }, body: "{}" });
    return { current: (await send(token)).status, invalid: (await send("fictitious-invalid-token")).status };
  });
  // Invalid data reaches validation only after current session/CSRF checks pass.
  expect(native.current).toBe(400);
  expect(native.invalid).toBe(403);
  expect((await apiRequest(page).post("/api/offline/sync", { data: {} })).status()).toBe(400);
  expect((await page.request.post("/api/offline/sync", { data: {}, headers: { Origin: "https://foreign.invalid", "x-csrf-token": "fictitious-browser-rotation-token" } })).status()).toBe(403);
  if (process.env.E2E_SERVER_MODE === "production") expect((await page.request.post("/api/offline/sync", { data: {}, headers: { Origin: origin } })).status()).toBe(403);
});
