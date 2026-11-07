import { expect, test, type Locator, type Page } from "@playwright/test";
import { CONNECTOR_CATALOG } from "../src/lib/altazor/connectors/catalog";
import type { EasyOAuthStatus } from "../src/lib/altazor/connectors/easy-oauth";
import type { ComputerStatus } from "../src/lib/altazor/computer/types";
import { loginAs } from "./helpers";

// Every application, account and authorization below is fictitious. Provider
// requests are blocked; these tests exercise the real compiled interface only.
const workspaceId = "distributed-connections-fixture";
const oauthApi = "/api/altazor/connectors/oauth";
const attemptId = "fictitious-github-device-attempt";
const userCode = "AB12-CD34";
const providers = ["google", "github"] as const;
type Provider = typeof providers[number];
const labels = { google: "Google", github: "GitHub" };
const kinds = { google: "google-workspace", github: "github" };
const computer: ComputerStatus = {
  enabled: true, configured: true, policyAllowed: true, canConfigure: true, state: "configured", workspaceId,
  provider: "synthetic-distributed-provider", version: "synthetic-distributed-gateway", lastVerifiedAt: null,
  reason: null, runtime: "container", sessions: [],
};

async function expectSimpleAccountPanel(catalog: Locator) {
  await expect(catalog.locator("form")).toHaveCount(0);
  await expect(catalog.locator('input[type="password"],input[name="clientId"],input[name="clientSecret"],textarea')).toHaveCount(0);
  await expect(catalog.getByText(/OAuth Playground|fine-grained|Client secret|Client ID|Probar con permisos de lectura|Opciones avanzadas/)).toHaveCount(0);
  await expect(catalog.getByRole("button", { name: /Guardar (?:preparación|conexión)|Probar acceso/ })).toHaveCount(0);
  await expect(catalog.locator('a[href*="settings/applications/new"],a[href*="settings/personal-access-tokens"],a[href*="oauthplayground"]')).toHaveCount(0);
}

async function setup(page: Page, flowProvider: Provider = "github") {
  const flowAttemptId = flowProvider === "github" ? attemptId : "fictitious-google-external-attempt";
  const authUrl = flowProvider === "github" ? "https://github.com/login/device" : "https://accounts.google.com/o/oauth2/v2/auth?client_id=fictitious-public-client&state=fictitious-state";
  const state = { started: false, connected: false, polls: 0, setupReads: 0 };
  const starts: Record<string, unknown>[] = [], pollBodies: Record<string, unknown>[] = [];
  await page.context().route("**/*", route => {
    const url = new URL(route.request().url());
    return ["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname) ? route.abort() : route.continue();
  });
  await page.route("**/api/altazor/computer/activity", route => route.fulfill({ json: { state: "idle", sessionId: null, monitor: false } }));
  await page.route("**/api/altazor/computer", route => route.fulfill({ json: { computer } }));
  const catalog = providers.map(provider => ({
    ...CONNECTOR_CATALOG.find(entry => entry.id === kinds[provider])!, available: true, oauthReady: true,
    // Deliberately offered by the fixture: easy account panels must still hide
    // all manual configuration, including outside their inner OAuth section.
    fields: [
      { name: "token", label: "Token de acceso", secret: true, required: false },
      { name: "client_id", label: "Client ID", secret: false, required: false },
      { name: "client_secret", label: "Client secret", secret: true, required: false },
    ],
  }));
  await page.route(`**/api/altazor/connectors?workspaceId=${workspaceId}`, route => route.fulfill({ json: { connectors: { catalog, connections: [], gateReady: true, persistentOAuthReady: true, version: "synthetic-distributed-gateway" } } }));
  await page.route(`**${oauthApi}?*`, route => {
    const result: EasyOAuthStatus = {
      workspaceId, causaId: null, canAdmin: true, requiresStop: false,
      providers: providers.map(provider => ({
        provider, label: labels[provider], available: true, reason: null,
        scopes: provider === "github" ? ["read:user"] : ["https://www.googleapis.com/auth/drive.readonly"],
        grantedScopes: state.connected ? provider === "github" ? ["read:user"] : ["https://www.googleapis.com/auth/drive.readonly"] : [],
        canReadFiles: state.connected, autoRefresh: state.connected && provider === "google", persistent: state.connected,
        connectionName: `${provider}-fictitious-account`, state: state.connected ? "connected" : state.started && provider === flowProvider ? "pending" : "idle",
        connected: state.connected, tested: state.connected, hasStoredConnection: state.connected, canDisconnect: state.connected,
        expiresAt: null, lastVerifiedAt: state.connected ? "2030-05-06T12:00:00Z" : null,
      })),
      ...(state.started ? { attempt: { id: flowAttemptId, provider: flowProvider, state: state.connected ? "completed" as const : "pending" as const, reason: null,
        ...(!state.connected ? flowProvider === "github" ? { device: { userCode, verificationUri: "https://github.com/login/device", interval: 5, expiresAt: "2030-05-06T12:10:00Z" } } : { external: true } : {}) } } : {}),
    };
    return route.fulfill({ json: result });
  });
  await page.route(`**${oauthApi}/setup`, route => { state.setupReads++; return route.fulfill({ json: { providers: [] } }); });
  await page.route(`**${oauthApi}/start`, route => {
    starts.push(route.request().postDataJSON()); state.started = true;
    return route.fulfill({ json: { attemptId: flowAttemptId, provider: flowProvider, flow: flowProvider === "github" ? "device" : "external", authUrl, expiresAt: "2030-05-06T12:10:00Z" } });
  });
  await page.route(`**${oauthApi}/device`, route => {
    state.polls++; pollBodies.push(route.request().postDataJSON()); state.connected = true;
    return route.fulfill({ json: { state: "completed", retryAfter: 5 } });
  });
  await loginAs(page, "abogado@estudio.cl");
  return { state, starts, pollBodies, flowAttemptId, authUrl };
}

for (const provider of providers) {
  test(`${labels[provider]} distribuido permite conectar sin formularios manuales en todo el panel`, async ({ page }, testInfo) => {
    const { state, starts } = await setup(page);
    await page.goto(`/inicio?altazor=connectors&connector=${provider}`);
    const catalog = page.getByTestId("altazor-connector-catalog"), panel = page.getByTestId("easy-connector-oauth");
    await expect(panel.getByRole("button", { name: `Conectar ${labels[provider]}`, exact: true })).toBeEnabled();
    await expectSimpleAccountPanel(catalog);
    for (const [size, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 360, height: 800 }]] as const) {
      await page.setViewportSize(viewport); await panel.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await catalog.screenshot({ path: testInfo.outputPath(`${provider}-distributed-${size}.png`) });
    }
    expect(starts).toEqual([]); expect(state.setupReads).toBe(0);
  });
}

test("GitHub muestra sólo el código de usuario y la página oficial, y completa el sondeo simulado", async ({ page }, testInfo) => {
  const { state, starts, pollBodies } = await setup(page);
  await page.goto("/inicio?altazor=connectors&connector=github");
  const catalog = page.getByTestId("altazor-connector-catalog"), panel = page.getByTestId("easy-connector-oauth");
  await panel.getByRole("button", { name: "Conectar GitHub", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`oauthAttempt=${attemptId}`));
  await expect(panel.locator("code")).toHaveText(userCode);
  const official = panel.getByRole("link", { name: "Continuar en GitHub", exact: true });
  await expect(official).toHaveAttribute("href", "https://github.com/login/device");
  await expect(official).toHaveAttribute("target", "_blank"); await expect(official).toHaveAttribute("rel", /noopener/);
  await expectSimpleAccountPanel(catalog);
  await expect(catalog.getByText(/device_code|access_token|refresh_token|fictitious-private/)).toHaveCount(0);
  await catalog.screenshot({ path: testInfo.outputPath("github-device-pending.png") });
  await expect(panel.getByRole("heading", { name: "GitHub conectado", exact: true })).toBeVisible({ timeout: 12_000 });
  await expect(panel.getByRole("status")).toContainText("Conexión guardada para este espacio.");
  await expect(panel.locator("code")).toHaveCount(0); await expectSimpleAccountPanel(catalog);
  expect(starts).toHaveLength(1); expect(starts[0]).toMatchObject({ workspaceId, provider: "github", confirmed: true });
  expect(Object.keys(starts[0])).not.toContain("clientSecret");
  expect(pollBodies).toEqual([{ attemptId }]); expect(state.polls).toBe(1); expect(state.setupReads).toBe(0);
  await page.reload();
  await expect(panel.getByRole("heading", { name: "GitHub conectado", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Conectar GitHub", exact: true })).toHaveCount(0);
  expect(starts).toHaveLength(1); expect(state.polls).toBe(1);
  await catalog.screenshot({ path: testInfo.outputPath("github-device-connected.png") });
});

test("Google abre el ingreso oficial fuera de la aplicación y confirma desde su ventana original", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const target = window as typeof window & { fictitiousExternalOpenUrls: string[] };
    target.fictitiousExternalOpenUrls = [];
    window.open = url => { target.fictitiousExternalOpenUrls.push(String(url)); return null; };
  });
  const { state, starts, pollBodies, flowAttemptId, authUrl } = await setup(page, "google");
  await page.goto("/inicio?altazor=connectors&connector=google");
  const catalog = page.getByTestId("altazor-connector-catalog"), panel = page.getByTestId("easy-connector-oauth");
  await panel.getByRole("button", { name: "Conectar Google", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/inicio\\?.*oauthAttempt=${flowAttemptId}`));
  const official = panel.getByRole("link", { name: "Continuar en Google", exact: true });
  await expect(official).toHaveAttribute("href", authUrl); await expect(official).toHaveAttribute("target", "_blank");
  expect(await page.evaluate(() => (window as typeof window & { fictitiousExternalOpenUrls: string[] }).fictitiousExternalOpenUrls)).toEqual([authUrl]);
  await expect(panel.locator("code")).toHaveCount(0); await expectSimpleAccountPanel(catalog);
  await catalog.screenshot({ path: testInfo.outputPath("google-external-pending.png") });
  await expect(panel.getByRole("heading", { name: "Google conectado", exact: true })).toBeVisible({ timeout: 12_000 });
  await expect(panel.getByRole("status")).toContainText("El acceso se renueva automáticamente.");
  expect(starts).toHaveLength(1); expect(starts[0]).toMatchObject({ workspaceId, provider: "google", access: "files", confirmed: true });
  expect(pollBodies).toEqual([{ attemptId: flowAttemptId }]); expect(state.setupReads).toBe(0);
  await page.reload();
  await expect(panel.getByRole("heading", { name: "Google conectado", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Conectar Google", exact: true })).toHaveCount(0);
  expect(starts).toHaveLength(1); expect(state.polls).toBe(1); await expectSimpleAccountPanel(catalog);
  await catalog.screenshot({ path: testInfo.outputPath("google-external-connected.png") });
});
