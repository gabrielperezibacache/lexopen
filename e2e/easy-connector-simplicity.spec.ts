import { expect, test, type Page } from "@playwright/test";
import { CONNECTOR_CATALOG } from "../src/lib/altazor/connectors/catalog";
import type { ComputerStatus } from "../src/lib/altazor/computer/types";
import { loginAs } from "./helpers";

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

    connected = true;
    await page.reload();
    await expect(panel.getByRole("heading", { name: `${label} conectado`, exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: `Conectar ${label}`, exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: `Desconectar ${label}`, exact: true })).toHaveCount(0);
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
  expect(starts).toHaveLength(2);
  expect(removals).toHaveLength(2);
  expect(removals.every(body => body.workspaceId === workspaceId && body.confirmed === true)).toBe(true);
});

test("la preparación administrativa se realiza en Configuración y no inicia sesión por la persona", async ({ page }) => {
  const saves: Record<string, unknown>[] = [];
  let configured = false, starts = 0;
  await blockExternalTraffic(page);
  await page.route(`**${oauthApi}/start`, route => { starts++; return route.abort(); });
  await page.route(`**${oauthApi}/setup`, route => {
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
