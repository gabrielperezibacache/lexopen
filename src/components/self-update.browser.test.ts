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
            location.search.includes("both") ? <><div id="banner-root"><UpdateAvailableBanner enabled canSelfUpdate /></div><SelfUpdatePanel /></> :
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
    for (const source of ["banner", "panel"]) {
      const page = await browser.newPage();
      let starts = 0;
      let phase = "idle";
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/admin/update-check") return route.fulfill({ json: { updateAvailable: true, currentVersion: "1.0.0", latestVersion: "1.1.0" } });
        if (url.pathname === "/api/admin/self-update") {
          const status = () => ({ phase, available: true, currentVersion: "1.0.0", updateAvailable: true, latestVersion: "1.1.0", message: "Actualización en cola" });
          if (route.request().method() === "POST") {
            starts++;
            phase = "queued";
            return route.fulfill({ json: { ok: true, status: status() } });
          }
          return route.fulfill({ json: status() });
        }
        return route.fulfill({ contentType: "text/html", body: `<html><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>` });
      });
      await page.goto("http://lexopen-update.test/?both");
      const banner = page.locator("#banner-root"), panel = page.getByTestId("self-update-panel");
      await expect(banner.getByRole("button", { name: "Actualizar ahora", exact: true })).toBeEnabled();
      await expect(panel.getByRole("button", { name: "Actualizar ahora", exact: true })).toBeEnabled();
      await (source === "banner" ? banner : panel).getByRole("button", { name: "Actualizar ahora", exact: true }).click();
      await expect(banner.getByText("Actualización en cola", { exact: true }).first()).toBeVisible();
      await expect(panel.getByText("Actualización en cola", { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Actualizar ahora", exact: true })).toHaveCount(0);
      assert.equal(starts, 1, "synchronizing widgets only refreshes state, never repeats a mutation");
      await page.close();
      console.log(`self-update browser: starting from ${source} synchronizes both widgets without a duplicate POST`);
    }
    for (const source of ["banner", "panel"]) for (const outcome of ["aborted", "conflict"]) {
      const page = await browser.newPage();
      await page.clock.install();
      let starts = 0, phase = "idle", offline = false, currentVersion = "1.0.0";
      let releasePost!: () => void;
      const pendingPost = new Promise<void>(resolve => { releasePost = resolve; });
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/admin/update-check") return route.fulfill({ json: { updateAvailable: true, currentVersion: "1.0.0", latestVersion: "1.1.0" } });
        if (url.pathname === "/api/admin/self-update") {
          const status = () => ({ phase, ok: phase === "done", requestId: phase === "idle" ? null : "fixture-job", available: true, currentVersion, updateAvailable: true, latestVersion: "1.1.0", message: phase === "done" ? "Actualización comprobada" : phase === "idle" ? "Estado inicial" : "Solicitud ficticia confirmada" });
          if (route.request().method() === "POST") {
            starts++;
            await pendingPost;
            phase = "queued";
            offline = true;
            if (outcome === "aborted") return route.abort("connectionreset");
            return route.fulfill({ status: 409, json: { error: "Actualización ya iniciada en otra vista" } });
          }
          if (offline) return route.abort("connectionrefused");
          return route.fulfill({ json: status() });
        }
        return route.fulfill({ contentType: "text/html", body: `<html><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>` });
      });
      try {
        await page.goto("http://lexopen-update.test/?both");
        const banner = page.locator("#banner-root"), panel = page.getByTestId("self-update-panel");
        await expect(page.getByRole("button", { name: "Actualizar ahora", exact: true })).toHaveCount(2);
        await (source === "banner" ? banner : panel).getByRole("button", { name: "Actualizar ahora", exact: true }).click();
        await expect(banner.getByRole("button", { name: "Iniciando…", exact: true })).toBeDisabled();
        await expect(panel.getByRole("button", { name: "Iniciando…", exact: true })).toBeDisabled();
        assert.equal(starts, 1);
        releasePost();
        await expect((source === "banner" ? banner : panel).getByText(outcome === "aborted" ? "Error de red" : "Actualización ya iniciada en otra vista", { exact: true })).toBeVisible();
        await expect(panel.getByRole("button", { name: "Comprobando actualización…", exact: true })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Actualizar ahora", exact: true })).toHaveCount(0);
        offline = false;
        await page.clock.runFor(3_001);
        await expect(banner.getByText("Solicitud ficticia confirmada", { exact: true }).first()).toBeVisible();
        await expect(panel.getByText("Solicitud ficticia confirmada", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("Error de red", { exact: true })).toHaveCount(0);
        phase = "done"; currentVersion = "1.1.0";
        await page.clock.runFor(3_001);
        await expect(banner.getByRole("button", { name: "Recargar aplicación", exact: true })).toBeVisible();
        await expect(panel.getByRole("button", { name: "Recargar aplicación", exact: true })).toBeVisible();
        assert.equal(starts, 1, "recovering an uncertain request or external conflict never repeats POST");
        console.log(`self-update browser: ${source} ${outcome} request keeps both widgets locked and recovers its receipt without another POST`);
      } finally {
        releasePost();
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
