import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const asset = (name: string) => readFileSync(`desktop/renderer/setup.${name}`, "utf8");
const html = asset("html")
  .replace("<!--SETUP_CSS-->", () => `<style>${asset("css")}</style>`)
  .replace("<!--SETUP_JS-->", () => `<script>${asset("js")}</script>`);

for (const locale of ["es-CL", "en-US"]) {
  test.describe(locale, () => {
    test.use({ locale });
    test("el instalador conserva la URL al cambiar de modo o fallar la conexión", async ({ page }) => {
      const english = locale === "en-US";
      await page.setViewportSize({ width: english ? 1366 : 360, height: 800 });
      await page.emulateMedia({ colorScheme: english ? "light" : "dark" });
      await page.addInitScript(() => {
        Object.assign(window, { lexopenDesktop: {
          getState: async () => ({ config: {}, dataDir: "/fixture/estudio", version: "1.1.0" }),
          onStatus() {}, onAltazorPreparation() {},
          prepareAltazorDesktop: async () => ({ state: "profile-detected", message: "OK" }),
          saveSetup: async () => { throw new Error("offline"); },
        } });
      });
      await page.route("https://lexopen.test/setup", route => route.fulfill({ contentType: "text/html", body: html }));
      await page.goto("https://lexopen.test/setup");
      await expect(page.locator("html")).toHaveAttribute("lang", english ? "en" : "es");
      const connect = page.getByRole("radio", { name: english ? /Connect to a server/ : /Conectar a un servidor/ });
      const host = page.getByRole("radio", { name: english ? /Host the firm/ : /Guardar los datos/ });
      const url = page.getByRole("textbox", { name: english ? "Firm server URL" : "URL del servidor del estudio" });
      const submit = page.getByRole("button", { name: english ? "Continue" : "Continuar", exact: true });
      await expect(submit).toBeEnabled();
      await expect(url).toBeHidden();
      await expect(page.locator("#port")).toBeHidden();
      await connect.check();
      await submit.press("Enter");
      await expect(url).toBeFocused();
      await url.fill("https://host.example");
      await host.check();
      await expect(url).toBeHidden();
      await connect.check();
      await expect(url).toHaveValue("https://host.example");
      await submit.click();
      await expect(page.getByRole("alert")).toContainText(english ? "Connection interrupted" : "Se interrumpió la conexión");
      await expect(url).toHaveValue("https://host.example");
      await expect(submit).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });
}
