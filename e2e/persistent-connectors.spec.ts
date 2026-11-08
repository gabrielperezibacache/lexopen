import { expect, test, type Page } from "@playwright/test";
import { CONNECTOR_CATALOG } from "../src/lib/altazor/connectors/catalog";
import { loginAs } from "./helpers";

// UI contracts only. Every account, gateway and OAuth response is fictitious.
const workspaceId = "persistent-connection-fixture";
const kinds = { google: "google-workspace", github: "github", dropbox: "dropbox" } as const;
const labels = { google: "Google", github: "GitHub", dropbox: "Dropbox" };
type Provider = keyof typeof kinds;

async function setup(page: Page, provider: Provider) {
  const state = { autoRefresh: provider !== "github", persistent: null as boolean | null, expiresAt: null as string | null, unavailable: false, staleAttempt: false };
  const starts: Record<string, unknown>[] = [];
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return ["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname) ? route.abort() : route.continue();
  });
  await page.route("**/api/altazor/computer/activity", route => route.fulfill({ json: { state: "idle", sessionId: null, monitor: false } }));
  await page.route("**/api/altazor/computer", route => route.fulfill({ json: { computer: {
    enabled: true, configured: true, policyAllowed: true, state: "configured", workspaceId, sessions: [],
  } } }));
  await page.route(`**/api/altazor/connectors?workspaceId=${workspaceId}`, route => route.fulfill({ json: { connectors: {
    catalog: [{ ...CONNECTOR_CATALOG.find(entry => entry.id === kinds[provider]), available: true, oauthReady: true, fields: [{ name: "token", label: "Token", secret: true, required: false }] }],
    connections: [], gateReady: true, persistentOAuthReady: true, version: "fictitious-persistent-gateway",
  } } }));
  await page.route("**/api/altazor/connectors/oauth?*", route => route.fulfill({ json: {
    workspaceId, causaId: null, canAdmin: false, requiresStop: false,
    providers: [{ provider, label: labels[provider], available: true, reason: state.unavailable ? "Fictitious temporary network outage" : null, scopes: [], grantedScopes: [], canReadFiles: true,
      autoRefresh: state.autoRefresh, persistent: state.persistent ?? (state.autoRefresh || provider === "github"), connectionName: `${provider}-fictitious-connection`, state: state.unavailable ? "unavailable" : "connected", connected: !state.unavailable, tested: !state.unavailable,
      hasStoredConnection: true, canDisconnect: true, expiresAt: state.expiresAt, lastVerifiedAt: "2030-05-06T12:00:00Z" }],
    ...(state.staleAttempt ? { attempt: { id: "fictitious-previous-attempt", provider, state: "failed", reason: "Fallo de un ingreso anterior ya resuelto" } } : {}),
  } }));
  await page.route("**/api/altazor/connectors/oauth/start", route => {
    starts.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, json: { error: "Ingreso manual ficticio preparado; no se abre una cuenta real." } });
  });
  await loginAs(page, "abogado@estudio.cl");
  await page.goto(`/inicio?altazor=connectors&connector=${provider}`);
  return { state, starts, panel: page.getByTestId("easy-connector-oauth") };
}

for (const provider of ["google", "dropbox", "github"] as const) {
  test(`${labels[provider]} conserva una cuenta guardada al recargar sin volver a iniciar sesión`, async ({ page }) => {
    const { state, starts, panel } = await setup(page, provider);
    await expect(panel.getByRole("heading", { name: `${labels[provider]} conectado`, exact: true })).toBeVisible();
    await expect(panel.getByRole("status")).toContainText(provider === "github" ? "Conexión guardada para este espacio." : "El acceso se renueva automáticamente.");
    for (let reload = 0; reload < 2; reload++) {
      await page.reload();
      await expect(panel.getByRole("heading", { name: `${labels[provider]} conectado`, exact: true })).toBeVisible();
    }
    await expect(panel.getByRole("button", { name: `Conectar ${labels[provider]}`, exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Mantener conexión", exact: true })).toHaveCount(0);
    expect(starts).toEqual([]);
    if (provider === "google") {
      state.staleAttempt = true;
      await page.reload();
      await expect(panel.getByText("Fallo de un ingreso anterior ya resuelto", { exact: true })).toHaveCount(0);
      state.unavailable = true;
      await page.reload();
      await expect(panel.getByRole("status")).toContainText("La conexión sigue guardada");
      await expect(panel.getByRole("button", { name: "Conectar Google", exact: true })).toHaveCount(0);
      await expect(panel.getByRole("button", { name: "Volver a autorizar mi cuenta", exact: true })).toHaveCount(0);
      state.unavailable = false;
      await panel.getByRole("button", { name: "Comprobar conexión", exact: true }).click();
      await expect(panel.getByRole("heading", { name: "Google conectado", exact: true })).toBeVisible();
      expect(starts).toEqual([]);
    }
  });
}

test("una conexión temporal se migra una sola vez mediante una acción manual", async ({ page }) => {
  const { state, starts, panel } = await setup(page, "google");
  state.autoRefresh = false;
  await page.reload();
  const maintain = panel.getByRole("button", { name: "Mantener conexión", exact: true });
  await expect(maintain).toBeEnabled();
  expect(starts).toEqual([]);
  await maintain.click();
  await expect(panel.getByRole("alert")).toContainText("Ingreso manual ficticio");
  expect(starts).toHaveLength(1);
  expect(starts[0]).toMatchObject({ provider: "google", workspaceId, access: "files", confirmed: true });
  // The next load represents return from the person's own official consent.
  state.autoRefresh = true;
  await page.reload();
  await expect(panel.getByRole("status")).toContainText("El acceso se renueva automáticamente.");
  await expect(maintain).toHaveCount(0);
  expect(starts).toHaveLength(1);
});

test("GitHub temporal ofrece mantener la conexión antes de vencer y la cuenta clásica no vuelve a pedir ingreso", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 1000 });
  const { state, starts, panel } = await setup(page, "github");
  const maintain = panel.getByRole("button", { name: "Mantener conexión", exact: true });
  // A classic non-expiring account stays connected without a new grant.
  await expect(panel.getByRole("heading", { name: "GitHub conectado", exact: true })).toBeVisible();
  await expect(maintain).toHaveCount(0);
  expect(starts).toEqual([]);
  state.persistent = false;
  state.expiresAt = "2030-05-06T20:00:00Z";
  await page.reload();
  await expect(panel.getByRole("heading", { name: "GitHub conectado", exact: true })).toBeVisible();
  await expect(maintain).toBeEnabled();
  expect(starts).toEqual([]);
  await panel.screenshot({ path: info.outputPath("github-keep-temporary-connection-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await maintain.click();
  await expect(panel.getByRole("alert")).toContainText("Ingreso manual ficticio");
  expect(starts).toHaveLength(1);
  expect(starts[0]).toMatchObject({ provider: "github", workspaceId, external: true, confirmed: true });
  expect(starts[0]).not.toHaveProperty("access", "files");
  // Returning with renewable access updates the existing account's state.
  state.autoRefresh = true;
  state.persistent = true;
  await page.reload();
  await expect(panel.getByRole("status")).toContainText("El acceso se renueva automáticamente.");
  await expect(maintain).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Conectar GitHub", exact: true })).toHaveCount(0);
  expect(starts).toHaveLength(1);
});
