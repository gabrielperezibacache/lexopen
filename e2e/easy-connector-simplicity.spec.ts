import { expect, test, type Page } from "@playwright/test";
import { CONNECTOR_CATALOG } from "../src/lib/altazor/connectors/catalog";
import type { ComputerStatus } from "../src/lib/altazor/computer/types";
import { loginAs } from "./helpers";

// These fixtures intercept provider replies; service-worker fetches bypass page routes.
test.use({ serviceWorkers: "block" });

// UI contracts only: every application, account and credential below is fictitious.
const workspaceId = "simple-connections-fixture";
const oauthApi = "/api/altazor/connectors/oauth";
const providers = ["google", "github"] as const;
const labels = { google: "Google", github: "GitHub" };
const connectorIds = { google: "google-workspace", github: "github" };
const computer: ComputerStatus = {
  enabled: true, configured: true, policyAllowed: true, canConfigure: true, state: "configured", workspaceId,
  provider: "synthetic-fixture", version: "synthetic-fixture", lastVerifiedAt: null, reason: null, runtime: "container", sessions: [],
};

async function blockExternalTraffic(page: Page) {
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return ["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname)
      ? route.abort() : route.continue();
  });
}

test("Google y GitHub ofrecen una acción principal y mantienen la desconexión dentro de gestión", async ({ page }, testInfo) => {
  let connected = false, setupReads = 0;
  const starts: Record<string, unknown>[] = [], removals: Record<string, unknown>[] = [];
  await blockExternalTraffic(page);
  await page.route("**/api/altazor/computer/activity", route => route.fulfill({ json: { state: "idle", sessionId: null, monitor: false } }));
  await page.route("**/api/altazor/computer", route => route.fulfill({ json: { computer } }));
  const catalog = providers.map(provider => ({
    ...CONNECTOR_CATALOG.find(item => item.id === connectorIds[provider])!,
    available: true, oauthReady: true, fields: [{ name: "token", label: "Token", secret: true, required: false }],
  }));
  const inventory = { catalog, connections: [], gateReady: true, version: "synthetic-fixture" };
  await page.route(`**/api/altazor/connectors?workspaceId=${workspaceId}`, route => route.fulfill({ json: { connectors: inventory } }));
  await page.route(`**${oauthApi}?*`, route => route.fulfill({ json: {
    workspaceId, causaId: null, canAdmin: true, requiresStop: false,
    providers: providers.map(provider => ({
      provider, label: labels[provider], available: true, reason: null, scopes: provider === "github" ? ["read:user"] : ["https://www.googleapis.com/auth/drive.metadata.readonly"],
      connectionName: `${provider}-fixture`, state: connected ? "connected" : "idle", connected, tested: connected,
      canReadFiles: connected, canManageFiles: false, manageAvailable: provider === "google", autoRefresh: connected, persistent: connected,
      hasStoredConnection: connected, canDisconnect: connected, expiresAt: null, lastVerifiedAt: connected ? "2030-05-06T12:00:00Z" : null,
    })),
  } }));
  await page.route(`**${oauthApi}/setup`, route => { setupReads++; return route.fulfill({ json: { providers: [] } }); });
  await page.route(`**${oauthApi}/start`, route => {
    starts.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, json: { error: "La aplicación del estudio necesita revisar su Client secret. Abre Configuración para corregirlo." } });
  });
  await page.route(/\/api\/altazor\/connectors\/(?:google|github)-fixture$/, route => {
    expect(route.request().method()).toBe("DELETE");
    removals.push(route.request().postDataJSON()); connected = false;
    return route.fulfill({ json: { operation: { status: "completed" }, inventory } });
  });
  await loginAs(page, "socio@estudio.cl");
  for (const provider of providers) {
    const label = labels[provider];
    connected = false;
    await page.goto(`/inicio?altazor=connectors&connector=${provider}`);
    const panel = page.getByTestId("easy-connector-oauth");
    await expect(panel.getByRole("button", { name: `Conectar ${label}`, exact: true })).toBeEnabled();
    await expect(panel.locator("button:visible")).toHaveCount(1);
    await expect(panel.getByLabel("Secreto de cliente (Client secret)")).toHaveCount(0);
    await panel.getByRole("button", { name: `Conectar ${label}`, exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Abre Configuración para corregirlo");
    expect(starts.at(-1)).toMatchObject({ workspaceId, provider, confirmed: true });
    if (provider === "google") expect(starts.at(-1)?.access).toBe("manage"); else expect(starts.at(-1)).not.toHaveProperty("access");

    connected = true;
    await page.reload();
    await expect(panel.getByRole("heading", { name: `${label} conectado`, exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: `Conectar ${label}`, exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: `Desconectar ${label}`, exact: true })).toHaveCount(0);
    if (provider === "google") {
      await expect(panel.getByText("Tu cuenta conserva acceso de sólo lectura a los documentos de Drive.", { exact: true })).toBeVisible();
      expect(starts.filter(body => body.provider === "google")).toHaveLength(1);
      await panel.getByRole("button", { name: "Permitir crear y editar", exact: true }).click();
      await expect(panel.getByRole("alert")).toContainText("Abre Configuración para corregirlo");
      expect(starts.at(-1)).toMatchObject({ provider: "google", access: "manage", confirmed: true });
      await expect(panel.getByRole("heading", { name: "Google conectado", exact: true })).toBeVisible();
    }
    for (const [size, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 360, height: 800 }]] as const) {
      await page.setViewportSize(viewport);
      await panel.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await panel.screenshot({ path: testInfo.outputPath(`${provider}-connected-${size}.png`) });
    }
    await panel.getByText("Gestionar conexión", { exact: true }).click();
    const disconnect = panel.getByRole("button", { name: `Desconectar ${label}`, exact: true });
    await expect(disconnect).toBeDisabled();
    await panel.getByRole("checkbox", { name: `Quiero desconectar ${label} de este espacio.`, exact: true }).check();
    await disconnect.click();
    await expect(panel.getByRole("button", { name: `Conectar ${label}`, exact: true })).toBeVisible();
  }
  expect(setupReads).toBe(0);
  expect(starts).toHaveLength(3);
  expect(removals).toHaveLength(2);
  expect(removals.every(body => body.workspaceId === workspaceId && body.confirmed === true)).toBe(true);
});

test("la preparación administrativa se realiza en Configuración y no inicia sesión por la persona", async ({ page }) => {
  const saves: Record<string, unknown>[] = [];
  let configured = false, starts = 0, setupReads = 0;
  await blockExternalTraffic(page);
  await page.route(`**${oauthApi}/start`, route => { starts++; return route.abort(); });
  await page.route(`**${oauthApi}/setup`, route => {
    setupReads++;
    if (route.request().method() === "PUT") { saves.push(route.request().postDataJSON()); configured = true; }
    return route.fulfill({ json: { providers: providers.map(provider => ({
      provider, label: labels[provider], configured, source: configured ? "saved" : "none", canEdit: true,
      callbackUri: new URL(`${oauthApi}/callback`, route.request().url()).href, reason: null,
      registrationUrl: provider === "github" ? "https://github.com/settings/applications/new" : "https://console.cloud.google.com/auth/clients",
    })) } });
  });
  await loginAs(page, "socio@estudio.cl");
  await page.goto("/configuracion#cuentas-conectadas");
  const panel = page.locator('[data-testid="easy-connector-administration"]:visible');
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveAttribute("open", "");
  await expect(panel.getByText("Configurar GitHub", { exact: true })).toBeHidden();
  expect(setupReads).toBe(0);
  await expect(page.getByRole("link", { name: /Google Drive.*archivos y carpetas/ })).toBeVisible();
  await panel.getByText("Administración avanzada de conexiones", { exact: true }).click();
  expect(setupReads).toBe(0);
  await panel.getByText("Configurar GitHub", { exact: true }).click();
  await expect(panel.getByText(/No uses el identificador del secreto, un token personal/)).toBeVisible();
  await panel.getByLabel("Identificador de cliente (Client ID)", { exact: true }).fill("synthetic-client-id");
  const secret = panel.getByLabel("Secreto de cliente (Client secret)", { exact: true });
  await expect(secret).toHaveAttribute("type", "password");
  await secret.fill("synthetic-client-secret-for-ui-only");
  await panel.getByRole("button", { name: "Guardar preparación", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Preparación guardada");
  await expect(secret).toHaveCount(0);
  expect(saves).toEqual([{ provider: "github", clientId: "synthetic-client-id", clientSecret: "synthetic-client-secret-for-ui-only", confirmed: true }]);
  expect(starts).toBe(0);
});

test("las tarjetas muestran sólo el alcance y el acceso comprobados de cada cuenta", async ({ page }, testInfo) => {
  const accountProviders = ["google", "github", "dropbox", "microsoft"] as const;
  const kinds = { ...connectorIds, dropbox: "dropbox", microsoft: "microsoft-365" };
  let setupReads = 0, oauthReads = 0, checked = false, unavailable = false;
  await blockExternalTraffic(page);
  await page.route("**/api/altazor/computer/activity", route => route.fulfill({ json: { state: "idle", sessionId: null, monitor: false } }));
  await page.route("**/api/altazor/computer", route => route.fulfill({ json: { computer } }));
  const catalog = accountProviders.map(provider => ({ ...CONNECTOR_CATALOG.find(item => item.id === kinds[provider])!, available: true, oauthReady: true, fields: [{ name: "token", label: "Token", secret: true, required: false }] }));
  const stored = accountProviders.map(provider => ({ name: `${provider}-fixture`, kind: kinds[provider], configured: true, signedIn: true, needsSignIn: false, ownAppConfigured: true, secretFields: ["token"], auth: "sign-in", usedBy: [] }));
  await page.route(`**/api/altazor/connectors?workspaceId=${workspaceId}`, route => route.fulfill({ json: { connectors: { catalog, connections: stored, gateReady: true } } }));
  await page.route(`**${oauthApi}?*`, route => {
    oauthReads++;
    if (unavailable) return route.fulfill({ status: 503, json: { error: "Synthetic unavailable account check" } });
    return route.fulfill({ json: { workspaceId, causaId: null, canAdmin: false, requiresStop: false, providers: accountProviders.map(provider => ({
      provider, available: provider !== "microsoft", state: provider === "microsoft" ? "blocked" : provider === "github" || provider === "google" && checked ? "connected" : "unavailable",
      connected: provider === "github" || provider === "google", tested: provider === "google" && checked, hasStoredConnection: true, canDisconnect: true,
      connectionName: `${provider}-fixture`, autoRefresh: true, persistent: true, canReadFiles: true, canManageFiles: false, manageAvailable: provider === "google",
    })) } });
  });
  await page.route(`**${oauthApi}/setup`, route => { setupReads++; return route.abort(); });
  await loginAs(page, "abogado@estudio.cl");
  await page.goto("/inicio?altazor=connectors");
  const panel = page.getByTestId("altazor-connector-catalog"), search = panel.getByRole("searchbox", { name: "Buscar aplicaciones" });
  await expect(panel.getByRole("button", { name: "Google Drive Conexión sin comprobar", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "GitHub Conexión sin comprobar", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "OneDrive · Microsoft 365 Servicio en preparación", exact: true })).toBeVisible();
  await search.fill("correo");
  await expect(panel.getByRole("button", { name: /Google Drive|Microsoft 365/ })).toHaveCount(0);
  await search.fill("públicos");
  await expect(panel.getByRole("button", { name: /GitHub/ })).toBeVisible();
  await search.fill("Drive");
  await panel.getByRole("button", { name: "Google Drive Conexión sin comprobar", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Google Drive", exact: true })).toBeVisible();
  checked = true;
  await panel.getByText("Opciones de conexión", { exact: true }).click();
  await panel.getByRole("button", { name: "Comprobar conexión", exact: true }).last().click();
  await expect(panel.getByRole("heading", { name: "Google conectado", exact: true })).toBeVisible();
  await expect(panel.getByText("Preparación del estudio en Configuración", { exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Todas las aplicaciones", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Google Drive Acceso comprobado", exact: true })).toBeVisible();
  for (const [size, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await panel.screenshot({ path: testInfo.outputPath(`account-catalog-${size}.png`) });
  }
  unavailable = true;
  await panel.getByRole("button", { name: "Comprobar estado", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Google Drive Estado sin comprobar", exact: true })).toBeVisible();
  expect(oauthReads).toBeGreaterThan(1);
  expect(setupReads).toBe(0);
  await page.goto("/configuracion#cuentas-conectadas");
  await expect(page.getByRole("heading", { name: "Cuentas conectadas", exact: true })).toBeVisible();
  await expect(page.getByTestId("easy-connector-administration")).toHaveCount(0);
  expect(setupReads).toBe(0);
});
