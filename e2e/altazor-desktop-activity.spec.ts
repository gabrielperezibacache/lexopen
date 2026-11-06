import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("Inicio móvil muestra el escritorio activo debajo del mensaje y lo oculta al tomar control", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const sessionId = "fictitious-desktop-for-browser";
  const frame = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ioAAAAASUVORK5CYII=", "base64");
  let held = false, captures = 0;
  const mutations: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/altazor/computer") && request.method() !== "GET") mutations.push(request.url());
  });
  await page.route("**/api/altazor/computer/activity", route => route.fulfill({ json: { state: held ? "paused" : "working", sessionId, monitor: true } }));
  await page.route(`**/api/altazor/computer/sessions/${sessionId}/screenshot?passive=1`, route => {
    captures++;
    return route.fulfill({ body: frame, contentType: "image/png" });
  });
  await loginAs(page, "abogado@estudio.cl");
  const activity = page.getByRole("region", { name: "Escritorio de Altazor", exact: true });
  await expect(activity.getByRole("status")).toHaveText("Altazor está trabajando");
  const screen = activity.getByRole("img", { name: "Vista actual del escritorio privado de Altazor", exact: true });
  await expect(screen).toBeVisible();
  await expect.poll(() => screen.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const composer = await page.getByTestId("inicio-composer").boundingBox(), desktop = await activity.boundingBox();
  expect(desktop?.y).toBeGreaterThan((composer?.y || 0) + (composer?.height || 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const previous = captures;
  held = true;
  await expect(activity.getByRole("status")).toHaveText("Vista pausada durante el control manual", { timeout: 12_000 });
  await expect(screen).toHaveCount(0);
  expect(captures).toBe(previous);
  expect(mutations).toEqual([]);
});

for (const state of ["help", "approval"] as const) {
  test(`la conversación lleva a la revisión del escritorio (${state}) sin autorizarla`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const sessionId = `desktop-review-${state}`;
    const session = { id: sessionId, state: "ready", held: false, canRenew: false, connectors: [] };
    const isHelp = state === "help";
    const mutations: string[] = [];
    page.on("request", request => {
      if (request.url().includes("/api/altazor/computer") && request.method() !== "GET") mutations.push(request.url());
    });
    await page.route("**/api/altazor/computer/activity", route => route.fulfill({ json: { state, sessionId, monitor: true } }));
    await page.route(`**/api/altazor/computer?sessionId=${sessionId}`, route => route.fulfill({
      json: { computer: { enabled: true, configured: true, policyAllowed: true, state: "configured", sessions: [session] } },
    }));
    await page.route(`**/api/altazor/computer/sessions/${sessionId}`, route => route.fulfill({
      json: {
        session,
        approvals: isHelp ? [] : [{ id: "fixture-approval", connector: "Dropbox de prueba", action: "list_folder", summary: "Listar carpeta de prueba", args: { path: "/prueba" }, reviewable: true }],
        turns: isHelp ? [{ index: 0, from: "assistant", text: "", working: true, needsHelp: false, steps: [{ action: "ask_help", at: "" }] }] : [],
      },
    }));
    await page.route(`**/api/altazor/computer/sessions/${sessionId}/screenshot?*`, route => route.fulfill({
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ioAAAAASUVORK5CYII=", "base64"),
      contentType: "image/png",
    }));
    await loginAs(page, "abogado@estudio.cl");
    await expect(page.getByRole("status").filter({ hasText: isHelp ? "Altazor necesita tu ayuda" : "Espera tu confirmación" })).toBeVisible();
    await page.getByRole("button", { name: isHelp ? "Revisar solicitud" : "Revisar autorización" }).click();
    if (isHelp) {
      const request = page.getByRole("article", { name: "Solicitud de ayuda de Altazor" });
      await expect(request).toContainText("Toma el control del escritorio y devuélveselo a Altazor cuando termines.");
      await expect(request).toBeFocused();
      await expect(page.getByRole("button", { name: "Tomar control" })).toBeEnabled();
    } else {
      await expect(page.getByRole("heading", { name: "Altazor espera tu decisión" })).toBeFocused();
      await expect(page.getByText("Listar carpeta de prueba", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Autorizar esta operación" })).toBeEnabled();
    }
    expect(mutations).toEqual([]);
  });
}
