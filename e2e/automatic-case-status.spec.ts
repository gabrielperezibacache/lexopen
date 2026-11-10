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

test("actualizar comprueba los registros antes de generar otra lectura", async ({ page }) => {
  await loginAs(page, "socio@estudio.cl");
  const id = (await (await page.request.get("/api/causas?limit=1")).json())[0].id;
  const snapshot = await (await page.request.get(`/api/causas/${id}/estado`)).json();
  let calls = 0;
  let release!: () => void;
  let began!: () => void;
  let denied = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const readStarted = new Promise<void>(resolve => { began = resolve; });
  await page.route(`**/api/causas/${id}/estado`, async route => { began(); await gate; await route.fulfill(denied ? { status: 404, json: { error: "Sin acceso" } } : { json: snapshot }); });
  await page.route("**/api/ai/actions", async route => {
    if (route.request().postDataJSON().action !== "causa.estado") return route.continue();
    calls++;
    await route.fulfill({ json: { source: "llm", content: `Lectura ${calls}`, caseStatus: snapshot } });
  });
  await page.goto(`/causas/${id}`);
  const panel = page.getByTestId("case-status");
  await expect(panel.getByText("Lectura 1", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Actualizar análisis", exact: true }).click();
  await readStarted;
  await expect(panel.getByRole("button", { name: "Comprobando estado…", exact: true })).toBeDisabled();
  expect(calls).toBe(1);
  release();
  await expect(panel.getByText("Lectura 2", { exact: true })).toBeVisible();
  denied = true;
  await panel.getByRole("button", { name: "Actualizar análisis", exact: true }).click();
  await expect(panel.getByText("La causa ya no está disponible con tus permisos actuales.")).toBeVisible();
  expect(calls).toBe(2);
});

test("una respuesta antigua no restaura datos después de denegar el acceso", async ({ page }) => {
  await loginAs(page, "socio@estudio.cl");
  const id = (await (await page.request.get("/api/causas?limit=1")).json())[0].id;
  const snapshot = await (await page.request.get(`/api/causas/${id}/estado`)).json();
  // Simulate a transport that ignores AbortSignal, to exercise the response-order guard.
  await page.addInitScript(({ id, snapshot }) => {
    const original = window.fetch.bind(window);
    let reads = 0;
    window.fetch = async (input, options) => {
      if (String(input).endsWith(`/api/causas/${id}/estado`)) {
        if (++reads === 1) return new Promise<Response>(resolve => { (window as Window & { releaseOld?: () => void }).releaseOld = () => resolve(new Response(JSON.stringify(snapshot), { status: 200, headers: { "Content-Type": "application/json" } })); });
        return new Response(JSON.stringify({ error: "Sin acceso" }), { status: 404 });
      }
      return original(input, options);
    };
  }, { id, snapshot });
  await page.route("**/api/ai/actions", route => route.request().postDataJSON().action === "causa.estado" ? route.fulfill({ json: { source: "llm", content: "Lectura visible", caseStatus: snapshot } }) : route.continue());
  await page.goto(`/causas/${id}`);
  const panel = page.getByTestId("case-status");
  await expect(panel.getByText("Lectura visible", { exact: true })).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForFunction(() => Boolean((window as Window & { releaseOld?: () => void }).releaseOld));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(panel.getByText("La causa ya no está disponible con tus permisos actuales.")).toBeVisible();
  await page.evaluate(async () => { (window as Window & { releaseOld?: () => void }).releaseOld?.(); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
  await expect(panel.getByText("La causa ya no está disponible con tus permisos actuales.")).toBeVisible();
  await expect(panel.getByText("Lectura visible", { exact: true })).toHaveCount(0);
});

test("las referencias de Altazor solo enlazan registros visibles", async ({ page }) => {
  await loginAs(page, "socio@estudio.cl");
  const cases: { id: string; plazos: unknown[] }[] = await (await page.request.get("/api/causas?limit=50")).json();
  const candidate = cases.find(row => row.plazos.length > 0);
  expect(candidate).toBeTruthy();
  const id = candidate!.id;
  const snapshot = await (await page.request.get(`/api/causas/${id}/estado`)).json();
  expect(snapshot.status.deadlines.length).toBeGreaterThan(0);
  const deadline = snapshot.status.deadlines[0];
  await page.route("**/api/ai/actions", route => route.request().postDataJSON().action === "causa.estado" ? route.fulfill({ json: { source: "llm", content: `Revisar [plazo:${deadline.id}]. Otro [plazo:inventado]. [Abrir](https://malicioso.invalid)`, caseStatus: snapshot } }) : route.continue());
  await page.goto(`/causas/${id}`);
  const panel = page.getByTestId("case-status");
  await expect(panel.getByRole("link", { name: `Plazo: ${deadline.title} · ${deadline.date}`, exact: true })).toHaveAttribute("href", "#plazos");
  await expect(panel.getByText("[Referencia no comprobada]", { exact: true })).toBeVisible();
  await expect(panel.locator('a[href*="malicioso.invalid"]')).toHaveCount(0);
});

test("el contexto antiguo del modelo no sustituye los registros actuales", async ({ page }) => {
  await loginAs(page, "socio@estudio.cl");
  const id = (await (await page.request.get("/api/causas?limit=1")).json())[0].id;
  const snapshot = await (await page.request.get(`/api/causas/${id}/estado`)).json();
  const old = { ...snapshot, fingerprint: `${snapshot.fingerprint}-old`, status: { ...snapshot.status, stage: "sentencia" } };
  let calls = 0;
  let release!: () => void;
  let began!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const readStarted = new Promise<void>(resolve => { began = resolve; });
  await page.route(`**/api/causas/${id}/estado`, async route => { began(); await gate; await route.fulfill({ json: snapshot }); });
  await page.route("**/api/ai/actions", async route => {
    if (route.request().postDataJSON().action !== "causa.estado") return route.continue();
    calls++;
    await route.fulfill({ json: { source: "llm", content: calls === 1 ? "Lectura antigua del modelo" : "Lectura contrastada", caseStatus: calls === 1 ? old : snapshot } });
  });
  await page.goto(`/causas/${id}`);
  const panel = page.getByTestId("case-status");
  await readStarted;
  await expect(panel.getByRole("button", { name: "Comprobando estado…", exact: true })).toBeDisabled();
  await expect(panel.getByText("Lectura antigua del modelo", { exact: true })).toHaveCount(0);
  expect(calls).toBe(1);
  release();
  await expect(panel.getByText("Lectura contrastada", { exact: true })).toBeVisible();
  expect(calls).toBe(2);
});
