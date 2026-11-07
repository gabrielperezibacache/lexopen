import { expect, test, type Page } from "@playwright/test";
import { CONNECTOR_CATALOG } from "../src/lib/altazor/connectors/catalog";
import { loginAs } from "./helpers";

// Browser contracts with fictitious accounts and screenshots only. This suite
// never authorizes a provider, transfers a token, or starts a real desktop.
const workspaceId = "chat-connected-workspace-fixture";
const sessionId = "chat-connected-desktop-fixture";
const connections = ["altazor-google-1234567890abcdef", "altazor-github-1234567890abcdef"];
const frame = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ioAAAAASUVORK5CYII=", "base64");

async function fixtures(page: Page) {
  const mutations: string[] = [];
  page.on("request", request => {
    if (/\/api\/altazor\/(computer|connectors)/.test(request.url()) && request.method() !== "GET") mutations.push(request.url());
  });
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return ["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname) ? route.abort() : route.continue();
  });
  const session = { id: sessionId, state: "ready", held: false, canRenew: false, connectors: connections };
  await page.route(/\/api\/altazor\/computer(?:\?.*)?$/, route => route.fulfill({ json: { computer: {
    enabled: true, configured: true, policyAllowed: true, state: "configured", workspaceId, sessions: [session],
  } } }));
  await page.route(`**/api/altazor/computer/sessions/${sessionId}`, route => route.fulfill({ json: {
    session, working: true, turns: [], approvals: [],
  } }));
  await page.route(`**/api/altazor/computer/sessions/${sessionId}/screenshot?*`, route => route.fulfill({ body: frame, contentType: "image/png" }));
  await page.route(`**/api/altazor/connectors?workspaceId=${workspaceId}`, route => route.fulfill({ json: { connectors: {
    catalog: CONNECTOR_CATALOG.filter(entry => ["google-workspace", "github"].includes(entry.id)).map(entry => ({
      ...entry, available: true, oauthReady: true, fields: [{ name: "token", label: "Token", secret: true, required: false }],
    })), connections: [], gateReady: true, version: "fictitious-chat-connectors",
  } } }));
  return { mutations };
}

for (const width of [1280, 360]) {
  test(`el chat abre Aplicaciones y conserva el borrador sin conectar ni iniciar tareas (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { mutations } = await fixtures(page);
    await page.route("**/api/altazor/computer/activity", route => route.fulfill({ json: { state: "idle", sessionId: null, monitor: true } }));
    await loginAs(page, "abogado@estudio.cl");
    const draft = "Busca el material del seminario en Drive y revisa el repositorio de ejemplo.";
    await page.getByTestId("inicio-composer").fill(draft);
    const apps = page.getByRole("button", { name: "Aplicaciones", exact: true });
    await expect(apps).toBeVisible();
    await apps.click();
    await expect(page.getByRole("heading", { name: "Aplicaciones", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Google Workspace/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /GitHub/ })).toBeVisible();
    await page.getByRole("button", { name: "Volver a la conversación", exact: true }).click();
    await expect(page.getByTestId("inicio-composer")).toHaveValue(draft);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(mutations).toEqual([]);
  });
}

test("el monitor muestra aplicaciones y avance reales y retira la imagen al perder la captura", async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const { mutations } = await fixtures(page);
  let screenshotAvailable = true;
  await page.route("**/api/altazor/computer/activity", route => route.fulfill({ json: {
    state: "working", sessionId, monitor: true,
    detail: { connections, step: { label: "Consultando una aplicación", at: "2030-05-06T17:01:00Z" } },
  } }));
  await page.route(`**/api/altazor/computer/sessions/${sessionId}/screenshot?*`, route => screenshotAvailable
    ? route.fulfill({ body: frame, contentType: "image/png" })
    : route.fulfill({ status: 503, json: { error: "Fictitious unavailable screenshot" } }));
  await loginAs(page, "abogado@estudio.cl");
  const monitor = page.getByRole("region", { name: "Escritorio de Altazor", exact: true });
  await monitor.scrollIntoViewIfNeeded();
  await expect(monitor.getByText("Aplicaciones de este escritorio: Google Drive · GitHub", { exact: true })).toBeVisible();
  await expect(monitor.getByText(/^Consultando una aplicación/)).toBeVisible();
  const screen = monitor.getByRole("img", { name: "Vista actual del escritorio privado de Altazor", exact: true });
  await expect(screen).toBeVisible();
  const composerBox = await page.getByTestId("inicio-composer").boundingBox(), monitorBox = await monitor.boundingBox();
  expect(monitorBox!.y).toBeGreaterThan(composerBox!.y + composerBox!.height);
  await monitor.screenshot({ path: info.outputPath("chat-live-connected-monitor.png") });
  screenshotAvailable = false;
  await expect(monitor.getByRole("status")).toHaveText("Vista no disponible", { timeout: 10_000 });
  await expect(screen).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test("el escritorio recibe sólo las cuentas elegidas y conserva la opción de abrir sin conexiones", async ({ page }) => {
  await fixtures(page);
  const starts: Record<string, unknown>[] = [];
  const catalog = CONNECTOR_CATALOG.filter(entry => ["google-workspace", "github"].includes(entry.id)).map(entry => ({
    ...entry, available: true, oauthReady: true, fields: [{ name: "token", label: "Token", secret: true, required: false }],
  }));
  await page.route("**/api/altazor/computer/activity", route => route.fulfill({ json: { state: "idle", sessionId: null, monitor: false } }));
  await page.route("**/api/altazor/computer", route => route.fulfill({ json: { computer: {
    enabled: true, configured: true, policyAllowed: true, state: "configured", workspaceId, sessions: [],
  } } }));
  await page.route(`**/api/altazor/connectors?workspaceId=${workspaceId}`, route => route.fulfill({ json: { connectors: {
    catalog, gateReady: true, version: "fictitious-chat-connectors",
    connections: connections.map((name, index) => ({ name, kind: index ? "github" : "google-workspace", configured: true, needsSignIn: false, signedIn: true, secretFields: ["token"], ownAppConfigured: false, auth: "token", usedBy: [] })),
  } } }));
  await page.route("**/api/altazor/computer/sessions", route => {
    starts.push(route.request().postDataJSON());
    // A fictitious rejected request lets us verify the next deliberate selection
    // without creating another browser fixture session or claiming acceptance.
    return route.fulfill({ status: 409, json: { error: "Inicio ficticio rechazado para comprobar la selección." } });
  });
  await loginAs(page, "abogado@estudio.cl");
  await page.goto("/inicio?altazor=computer");
  const panel = page.getByRole("region", { name: "Escritorio de Altazor", exact: true });
  const applications = panel.getByRole("group", { name: "Aplicaciones para este escritorio", exact: true });
  await expect(applications.getByRole("checkbox", { name: "Google Drive", exact: true })).not.toBeChecked();
  await expect(applications.getByRole("checkbox", { name: "GitHub", exact: true })).not.toBeChecked();
  const start = panel.getByRole("button", { name: "Iniciar escritorio privado", exact: true });
  await start.click();
  await expect.poll(() => starts.length).toBe(1);
  expect(starts[0]).toMatchObject({ workspaceId, connectors: [], confirmed: true });
  await expect(start).toBeEnabled();
  await applications.getByRole("checkbox", { name: "Google Drive", exact: true }).check();
  await start.click();
  await expect.poll(() => starts.length).toBe(2);
  expect(starts[1]).toMatchObject({ workspaceId, connectors: [connections[0]], confirmed: true });
  await expect(start).toBeEnabled();
  await applications.getByRole("checkbox", { name: "GitHub", exact: true }).check();
  await start.click();
  await expect.poll(() => starts.length).toBe(3);
  expect(starts[2]).toMatchObject({ workspaceId, connectors: [...connections].sort(), confirmed: true });
  expect(starts[0].requestId).not.toBe(starts[1].requestId);
  expect(starts[1].requestId).not.toBe(starts[2].requestId);
});
