import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("el estado interpreta automáticamente, actualiza cambios y oculta datos tras perder acceso", async ({ page }, testInfo) => {
  await loginAs(page, "socio@estudio.cl");
  const rows = await (await page.request.get("/api/causas?limit=1")).json();
  const id = rows[0].id;
  let snapshot = await (await page.request.get(`/api/causas/${id}/estado`)).json();
  let calls = 0;
  let denied = false;
  await page.route(`**/api/causas/${id}/estado`, route => denied ? route.fulfill({ status: 404, json: { error: "Sin acceso" } }) : route.fulfill({ json: snapshot }));
  await page.route("**/api/ai/actions", async route => {
    const body = route.request().postDataJSON();
    if (body.action !== "causa.estado") return route.continue();
    expect(body).toEqual({ action: "causa.estado", causaId: id });
    calls++;
    await route.fulfill({ json: { ok: true, source: "llm", content: `Interpretación automática ${calls}`, caseStatus: snapshot } });
  });
  await page.goto(`/causas/${id}`);
  const panel = page.getByTestId("case-status");
  await expect(panel.getByRole("heading", { name: "Qué se está esperando", exact: true })).toBeVisible();
  await expect(panel.getByText("Interpretación automática 1", { exact: true })).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => calls).toBe(1);
  snapshot = { ...snapshot, fingerprint: `${snapshot.fingerprint}-new`, status: { ...snapshot.status, stage: "prueba" } };
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(panel.getByText("Interpretación automática 2", { exact: true })).toBeVisible();
  await panel.screenshot({ path: testInfo.outputPath("estado-desktop.png") });
  denied = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(panel.getByText("La causa ya no está disponible con tus permisos actuales.")).toBeVisible();
  await expect(panel.getByText("Interpretación automática 2", { exact: true })).toHaveCount(0);
  expect(calls).toBe(2);
});

test("el estado móvil conserva los hechos si el proveedor solo ofrece una demostración", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await loginAs(page, "socio@estudio.cl");
  const rows = await (await page.request.get("/api/causas?limit=1")).json();
  await page.route("**/api/ai/actions", route => route.request().postDataJSON().action === "causa.estado"
    ? route.fulfill({ json: { ok: true, source: "demo", content: "SENTENCIA FICTICIA QUE NO DEBE MOSTRARSE" } }) : route.continue());
  await page.goto(`/causas/${rows[0].id}`);
  const panel = page.getByTestId("case-status");
  await expect(panel.getByText("La IA está en demostración: se muestran únicamente los registros de la causa.")).toBeVisible();
  await expect(panel.getByText("SENTENCIA FICTICIA QUE NO DEBE MOSTRARSE")).toHaveCount(0);
  await expect(panel.getByRole("heading", { name: "Plazos próximos y vencidos", exact: true })).toBeVisible();
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await panel.screenshot({ path: testInfo.outputPath("estado-mobile.png") });
});
