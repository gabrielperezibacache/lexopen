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
const providers = ["google", "github", "dropbox", "microsoft"] as const;
type Provider = typeof providers[number];
const labels = { google: "Google", github: "GitHub", dropbox: "Dropbox", microsoft: "Microsoft 365" };
const kinds = { google: "google-workspace", github: "github", dropbox: "dropbox", microsoft: "microsoft-365" };
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

async function setup(page: Page, flowProvider: Provider = "github", options: { holdPending?: boolean; available?: boolean; managementReady?: boolean } = {}) {
  const flowAttemptId = flowProvider === "github" ? attemptId : `fictitious-${flowProvider}-external-attempt`;
  const authUrl = flowProvider === "github" ? "https://github.com/login/device" : flowProvider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth?client_id=fictitious-public-client&state=fictitious-state" : flowProvider === "dropbox" ? "https://www.dropbox.com/oauth2/authorize?client_id=fictitious-public-client&state=fictitious-state" : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=12345678-abcd-1234-abcd-123456789abc&state=fictitious-state";
  const state = { started: false, connected: false, polls: 0, setupReads: 0, activeAttemptId: flowAttemptId };
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
  await page.route(`**/api/altazor/connectors?workspaceId=${workspaceId}`, route => route.fulfill({ json: { connectors: { catalog, connections: [], gateReady: true, persistentOAuthReady: true, cloudFileOAuthReady: true, version: "synthetic-distributed-gateway" } } }));
  await page.route(`**${oauthApi}?*`, route => {
    const result: EasyOAuthStatus = {
      workspaceId, causaId: null, canAdmin: true, requiresStop: false,
      providers: providers.map(provider => ({
        provider, label: labels[provider], available: options.available !== false, reason: options.available === false ? "Servicio en preparación." : null,
        scopes: provider === "github" ? ["read:user"] : provider === "google" ? ["https://www.googleapis.com/auth/drive"] : provider === "microsoft" ? ["Files.Read", "User.Read"] : ["account_info.read", "files.metadata.read", "files.content.read"],
        grantedScopes: state.connected ? provider === "github" ? ["read:user"] : provider === "google" ? ["https://www.googleapis.com/auth/drive"] : provider === "microsoft" ? ["Files.Read", "User.Read"] : ["account_info.read", "files.metadata.read", "files.content.read"] : [],
        canReadFiles: state.connected, autoRefresh: state.connected && provider !== "github", persistent: state.connected,
        canManageFiles: provider === "google" && state.connected, manageAvailable: provider === "google" && options.managementReady !== false,
        connectionName: `${provider}-fictitious-account`, state: state.connected ? "connected" : options.available === false ? "blocked" : state.started && provider === flowProvider ? "pending" : "idle",
        connected: state.connected, tested: state.connected, hasStoredConnection: state.connected, canDisconnect: state.connected,
        expiresAt: null, lastVerifiedAt: state.connected ? "2030-05-06T12:00:00Z" : null,
      })),
      ...(state.started ? { attempt: { id: state.activeAttemptId, provider: flowProvider, state: state.connected ? "completed" as const : "pending" as const, reason: null,
        ...(!state.connected ? flowProvider === "github" ? { device: { userCode, verificationUri: "https://github.com/login/device", interval: 5, expiresAt: "2030-05-06T12:10:00Z" } } : { external: true } : {}) } } : {}),
    };
    return route.fulfill({ json: result });
  });
  await page.route(`**${oauthApi}/setup`, route => { state.setupReads++; return route.fulfill({ json: { providers: [] } }); });
  await page.route(`**${oauthApi}/start`, route => {
    starts.push(route.request().postDataJSON()); state.started = true;
    state.activeAttemptId = starts.length === 1 ? flowAttemptId : `${flowAttemptId}-${starts.length}`;
    return route.fulfill({ json: { attemptId: state.activeAttemptId, provider: flowProvider, flow: flowProvider === "github" ? "device" : "external", authUrl, expiresAt: "2030-05-06T12:10:00Z" } });
  });
  await page.route(`**${oauthApi}/device`, route => {
    state.polls++; pollBodies.push(route.request().postDataJSON()); state.connected = !options.holdPending;
    return route.fulfill({ json: { state: state.connected ? "completed" : "pending", retryAfter: 5 } });
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
  await expect(panel.getByText(/Google solicitará permiso para leer, crear, editar, organizar y eliminar/)).toBeVisible();
  await panel.getByRole("button", { name: "Conectar Google", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/inicio\\?.*oauthAttempt=${flowAttemptId}`));
  const official = panel.getByRole("link", { name: "Continuar en Google", exact: true });
  await expect(official).toHaveAttribute("href", authUrl); await expect(official).toHaveAttribute("target", "_blank");
  expect(await page.evaluate(() => (window as typeof window & { fictitiousExternalOpenUrls: string[] }).fictitiousExternalOpenUrls)).toEqual([authUrl]);
  await expect(panel.locator("code")).toHaveCount(0); await expectSimpleAccountPanel(catalog);
  await catalog.screenshot({ path: testInfo.outputPath("google-external-pending.png") });
  await expect(panel.getByRole("heading", { name: "Google conectado", exact: true })).toBeVisible({ timeout: 12_000 });
  await expect(panel.getByRole("status")).toContainText("El acceso se renueva automáticamente.");
  expect(starts).toHaveLength(1); expect(starts[0]).toMatchObject({ workspaceId, provider: "google", access: "manage", confirmed: true });
  expect(pollBodies).toEqual([{ attemptId: flowAttemptId }]); expect(state.setupReads).toBe(0);
  await page.reload();
  await expect(panel.getByRole("heading", { name: "Google conectado", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Conectar Google", exact: true })).toHaveCount(0);
  expect(starts).toHaveLength(1); expect(state.polls).toBe(1); await expectSimpleAccountPanel(catalog);
  await catalog.screenshot({ path: testInfo.outputPath("google-external-connected.png") });
});

test("Google no solicita gestión si el escritorio aún no la admite", async ({ page }) => {
  const { starts, state } = await setup(page, "google", { managementReady: false });
  await page.goto("/inicio?altazor=connectors&connector=google");
  const panel = page.getByTestId("easy-connector-oauth");
  await expect(panel.getByRole("button", { name: "Conectar Google", exact: true })).toBeDisabled();
  await expect(panel.getByText(/Actualiza el escritorio de Altazor para habilitar la creación y edición/)).toBeVisible();
  expect(starts).toEqual([]); expect(state.setupReads).toBe(0);
});

for (const provider of ["google", "dropbox", "microsoft"] as const) {
  test(`${labels[provider]} permite reiniciar explícitamente un ingreso perdido al recargar`, async ({ page }, testInfo) => {
    await page.addInitScript(() => { window.open = () => null; });
    const { state, starts } = await setup(page, provider, { holdPending: true });
    await page.goto(`/inicio?altazor=connectors&connector=${provider}`);
    const catalog = page.getByTestId("altazor-connector-catalog"), panel = page.getByTestId("easy-connector-oauth");
    await panel.getByRole("button", { name: `Conectar ${labels[provider]}`, exact: true }).click();
    await expect(panel.getByRole("link", { name: `Continuar en ${labels[provider]}`, exact: true })).toBeVisible();
    expect(starts).toHaveLength(1); const originalRequestId = starts[0].requestId;
    await page.reload();
    const restart = panel.getByRole("button", { name: `Reiniciar ingreso en ${labels[provider]}`, exact: true });
    await expect(restart).toBeEnabled(); await expectSimpleAccountPanel(catalog);
    expect(starts).toHaveLength(1); expect(state.connected).toBe(false);
    await restart.click();
    await expect.poll(() => starts.length).toBe(2);
    expect(starts[1].requestId).not.toEqual(originalRequestId);
    expect(starts[1]).toMatchObject({ provider, external: true, confirmed: true });
    expect(starts[1]).not.toHaveProperty("clientSecret");
    await expect(panel.getByRole("link", { name: `Continuar en ${labels[provider]}`, exact: true })).toBeVisible();
    await expect(panel.getByRole("heading", { name: `${labels[provider]} conectado`, exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 360, height: 800 }); await panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await catalog.screenshot({ path: testInfo.outputPath(`${provider}-external-recovery-mobile.png`) });
  });
}

for (const provider of ["dropbox", "microsoft"] as const) {
  test(`${labels[provider]} sin identidad del publicador sólo muestra servicio en preparación`, async ({ page }) => {
    const { starts, state } = await setup(page, provider, { available: false });
    await page.goto(`/inicio?altazor=connectors&connector=${provider}`);
    const catalog = page.getByTestId("altazor-connector-catalog"), panel = page.getByTestId("easy-connector-oauth");
    await expect(panel.getByRole("button", { name: "Servicio en preparación", exact: true })).toBeDisabled();
    await expect(panel.getByRole("link", { name: "Preparación del estudio en Configuración", exact: true }).first()).toBeVisible();
    await expectSimpleAccountPanel(catalog); expect(starts).toHaveLength(0); expect(state.setupReads).toBe(0);
  });
}
