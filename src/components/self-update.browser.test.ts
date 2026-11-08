/** Browser regression with the actual React components and local API fixtures only. */
import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect } from "@playwright/test";

async function main() {
  const bundle = await build({
    absWorkingDir: process.cwd(),
    stdin: {
      contents: `import { createRoot } from "react-dom/client";
        import { UpdateAvailableBanner } from "./src/components/UpdateAvailableBanner";
        import { SelfUpdatePanel } from "./src/components/SelfUpdatePanel";
        import { I18nProvider } from "./src/components/i18n/I18nProvider";
        import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
        createRoot(document.getElementById("root")).render(
          <AppRouterContext.Provider value={{refresh(){}}}><I18nProvider locale="es">{
            location.search.includes("panel") ? <SelfUpdatePanel /> : <UpdateAvailableBanner enabled canSelfUpdate />
          }</I18nProvider></AppRouterContext.Provider>
        );`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    loader: { ".css": "empty", ".module.css": "empty" },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}" },
  });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: path.resolve(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) } : {}),
  });
  const phases = ["preflight", "backing_up", "applying", "pulling", "installing", "migrating", "building", "restarting", "awaiting_restart"];
  try {
    for (const component of ["banner", "panel"]) {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.clock.install();
      let status = { phase: "idle", available: true, recoveryRequired: false, currentVersion: "1.0.0", message: "", error: "" };
      let reads = 0;
      let starts = 0;
      let offline = false;
      let rejectStart = false;
      let updateAvailable = true;
      let latestVersion = "1.1.0";
      let checkOffline = false;
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/admin/update-check") {
          if (checkOffline) return route.abort("connectionrefused");
          return route.fulfill({ json: { updateAvailable, currentVersion: status.currentVersion, latestVersion, disabled: false } });
        }
        if (url.pathname === "/api/admin/self-update") {
          if (route.request().method() === "POST") {
            starts++;
            if (rejectStart) return route.fulfill({ status: 409, json: { error: "Actualización ya en curso" } });
            status = { ...status, phase: "queued", message: "Actualización en cola" };
            return route.fulfill({ json: { ok: true, status } });
          }
          reads++;
          if (offline) return route.abort("connectionrefused");
          return route.fulfill({ json: { ...status, updateAvailable, latestVersion } });
        }
        return route.fulfill({ contentType: "text/html", body: `<html><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>` });
      });
      await page.goto(`http://lexopen-update.test/?${component}`);
      const start = page.getByRole("button", { name: "Actualizar ahora", exact: true });
      await expect(start).toBeEnabled();
      if (component === "banner") {
        await page.getByRole("button", { name: "Pasos manuales", exact: true }).click();
        await expect(page.getByRole("link", { name: "Abrir guía de actualización", exact: true })).toHaveAttribute("href", "https://github.com/gabrielperezibacache/lexopen/blob/main/docs/ACTUALIZACIONES.md");
      }
      rejectStart = true;
      await start.click();
      await expect(page.getByText("Actualización ya en curso", { exact: true })).toBeVisible();
      await expect(start).toBeEnabled();
      rejectStart = false;
      await start.click();
      await expect(page.getByText("Actualización en cola", { exact: true }).first()).toBeVisible();
      for (const phase of phases) {
        const previousReads = reads;
        status = { ...status, phase, message: `Progreso: ${phase}` };
        await page.clock.runFor(3_001);
        await expect(page.getByText(status.message, { exact: true })).toBeVisible();
        assert.ok(reads > previousReads, `${component} must keep polling through ${phase}`);
        await expect(page.getByRole("button", { name: "Actualizar ahora", exact: true })).toHaveCount(0);
      }
      offline = true;
      await page.clock.runFor(3_001);
      offline = false;
      status = { ...status, currentVersion: "1.1.0", phase: "done", message: "Actualización verificada" };
      await page.clock.runFor(3_001);
      await expect(page.getByText(status.message, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^Recargar/ })).toBeVisible();
      const terminalReads = reads;
      await page.clock.runFor(6_001);
      assert.equal(reads, terminalReads, "polling stops after confirmed completion");
      assert.equal(starts, 2, "polling never repeats the update mutation");

      // A fresh page already loaded the new app. An old receipt must not ask for
      // an endless sequence of reloads or obscure a later release.
      updateAvailable = false;
      await page.reload();
      if (component === "banner") {
        await expect(page.getByRole("button", { name: /^Recargar/ })).toHaveCount(0);
        await expect(page.getByText("LexOpen se actualizó correctamente", { exact: true })).toHaveCount(0);
      } else {
        await expect(page.getByTestId("self-update-panel")).not.toContainText("disponible v1.1.0");
      }
      updateAvailable = true;
      latestVersion = "1.2.0";
      await page.reload();
      await expect(page.getByRole("button", { name: "Actualizar ahora", exact: true })).toBeEnabled();
      if (component === "banner") {
        await expect(page.getByText("v1.2.0", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: /^Recargar/ })).toHaveCount(0);
      }

      // A remote check failure must not suppress an active local update.
      updateAvailable = false;
      checkOffline = true;
      status = { ...status, phase: "preflight", message: "Comprobando actualización local" };
      await page.reload();
      await expect(page.getByText(status.message, { exact: true })).toBeVisible();
      checkOffline = false;

      // Opening while the Host is offline must recover without another reload.
      offline = true;
      await page.reload();
      if (component === "panel") await expect(page.getByRole("button", { name: "Reintentar", exact: true })).toBeVisible();
      offline = false;
      await page.clock.runFor(3_001);
      await expect(page.getByText(status.message, { exact: true })).toBeVisible();

      status = { ...status, phase: "failed", recoveryRequired: true, message: "Conserve el respaldo", error: "Falló la comprobación del reinicio" };
      await page.reload();
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(page.getByText(status.error, { exact: true })).toBeVisible();
      if (component === "banner") await expect(page.getByRole("button", { name: "Actualizar ahora", exact: true })).toHaveCount(0);
      else await expect(page.getByRole("button", { name: "Buscar y actualizar", exact: true })).toBeDisabled();
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`self-update browser: ${component} queue/all phases/offline restart/fresh receipt/next release/initial retry/recovery passed`);
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
