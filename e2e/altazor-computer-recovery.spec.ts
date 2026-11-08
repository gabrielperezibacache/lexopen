import { expect, test, type Page, type Route } from "@playwright/test";
import { CONNECTOR_CATALOG } from "../src/lib/altazor/connectors/catalog";
import type { ConnectorInventory } from "../src/lib/altazor/connectors/types";
import type { ComputerSessionSummary, ComputerStatus } from "../src/lib/altazor/computer/types";
import { loginAs } from "./helpers";

// Synthetic gateway replies only: these tests do not contact a provider,
// create containers or connect a real account.
const workspaceId = "desktop-recovery-fixture";
const frame = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ioAAAAASUVORK5CYII=", "base64");
const emptyInventory: ConnectorInventory = { catalog: [], connections: [], gateReady: true, version: "synthetic-fixture" };
function session(id: string, state = "ready"): ComputerSessionSummary {
  return { id, state, expiresAt: "2030-05-06T18:00:00Z", renewableUntil: "2030-05-06T19:00:00Z", canRenew: false,
    held: false, createdAt: "2030-05-06T17:00:00Z", connectors: [], requiresStop: state !== "closed" };
}
function computer(sessions: ComputerSessionSummary[]): ComputerStatus {
  return { enabled: true, configured: true, policyAllowed: true, canConfigure: true, state: "configured", workspaceId,
    provider: "synthetic-fixture", version: "synthetic-fixture", lastVerifiedAt: null, reason: null, runtime: "container", sessions };
}
async function idleActivity(page: Page) {
  await page.route("**/api/altazor/computer/activity", route => route.fulfill({ json: { state: "idle", sessionId: null, monitor: false } }));
}

test("el escritorio renueva su imagen sin solapar capturas y se pausa al volver al chat u ocultar la página", async ({ page }) => {
  test.setTimeout(45_000);
  const desktop = session("desktop-visible-fixture");
  let captures = 0, pending = 0, maximumPending = 0;
  let retainedCapture: Route | undefined;
  const mutations: string[] = [];
  await page.clock.install();
  await idleActivity(page);
  await page.route(`**/api/altazor/connectors?workspaceId=${workspaceId}`, route => route.fulfill({ json: { connectors: emptyInventory } }));
  await page.route(/\/api\/altazor\/computer(?:\?.*)?$/, route => route.fulfill({ json: { computer: computer([desktop]) } }));
  await page.route(`**/api/altazor/computer/sessions/${desktop.id}`, route => route.fulfill({ json: { session: desktop, approvals: [], turns: [] } }));
  await page.route(`**/api/altazor/computer/sessions/${desktop.id}/screenshot?*`, async route => {
    captures++; pending++; maximumPending = Math.max(maximumPending, pending);
    if (captures === 2) { retainedCapture = route; return; }
    await route.fulfill({ body: frame, contentType: "image/png" });
    pending--;
  });
  page.on("request", request => { if (request.url().includes("/api/altazor/computer") && request.method() !== "GET") mutations.push(request.url()); });
  try {
    await loginAs(page, "abogado@estudio.cl");
    await page.goto(`/inicio?altazor=computer&escritorio=${desktop.id}`);
    const panel = page.getByRole("region", { name: "Escritorio de Altazor", exact: true, includeHidden: true })
      .filter({ has: page.getByLabel("Sesión de este espacio", { exact: true }) });
    const viewport = panel.getByRole("region", { name: "Vista del escritorio con desplazamiento", exact: true });
    const screen = panel.getByRole("img", { name: "Captura del escritorio privado en contenedor", exact: true });
    await viewport.scrollIntoViewIfNeeded();
    await expect.poll(() => captures).toBe(1);
    await expect.poll(() => screen.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.clock.fastForward(3000);
    await expect.poll(() => captures).toBe(2);
    await page.clock.fastForward(6000);
    expect(captures).toBe(2);
    expect(maximumPending).toBe(1);
    await retainedCapture!.fulfill({ body: frame, contentType: "image/png" });
    retainedCapture = undefined; pending--;
    await expect.poll(() => screen.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.clock.fastForward(3000);
    await expect.poll(() => captures).toBeGreaterThan(2);
    await page.getByRole("button", { name: "Volver a la conversación", exact: true }).click();
    await expect(panel).toBeHidden();
    const chatCaptures = captures;
    await page.clock.fastForward(12000);
    expect(captures).toBe(chatCaptures);
    await page.getByLabel("Mi asistente", { exact: true }).click();
    await page.getByRole("button", { name: "Computadora", exact: true }).click();
    await panel.getByLabel("Sesión de este espacio", { exact: true }).selectOption(desktop.id);
    await viewport.scrollIntoViewIfNeeded();
    await expect.poll(() => captures).toBeGreaterThan(chatCaptures);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const hiddenCaptures = captures;
    await page.clock.fastForward(12000);
    expect(captures).toBe(hiddenCaptures);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => captures).toBeGreaterThan(hiddenCaptures);
    expect(maximumPending).toBe(1);
    expect(mutations).toEqual([]);
  } finally { if (retainedCapture) await retainedCapture.abort().catch(() => {}); }
});

test("una sesión pasa de iniciándose a disponible también en el selector y conserva sus controles actuales", async ({ page }) => {
  const starting = { ...session("desktop-starting-fixture", "starting"), canRenew: false, requiresStop: true };
  const ready = { ...starting, state: "ready", canRenew: true, held: true };
  let created = false, closed = false, starts = 0;
  let firstRead: Route | undefined;
  await idleActivity(page);
  await page.route(`**/api/altazor/connectors?workspaceId=${workspaceId}`, route => route.fulfill({ json: { connectors: emptyInventory } }));
  await page.route("**/api/altazor/computer", route => route.fulfill({ json: {
    computer: computer(created ? [{ ...starting, ...(closed ? { state: "closed", canRenew: false, requiresStop: false } : {}) }] : []),
  } }));
  await page.route("**/api/altazor/computer/sessions", route => {
    starts++; created = true;
    return route.fulfill({ json: { session: starting } });
  });
  await page.route(`**/api/altazor/computer/sessions/${starting.id}`, route => { firstRead = route; });
  await page.route(`**/api/altazor/computer/sessions/${starting.id}/screenshot?*`, route => route.fulfill({ body: frame, contentType: "image/png" }));
  await page.route(`**/api/altazor/computer/sessions/${starting.id}/actions`, route => {
    expect(route.request().postDataJSON().action).toBe("close"); closed = true;
    return route.fulfill({ json: { action: { id: "fixture-started-stop", status: "completed", result: { stopped: true } } } });
  });
  try {
    await loginAs(page, "abogado@estudio.cl");
    await page.goto("/inicio?altazor=computer");
    const panel = page.getByRole("region", { name: "Escritorio de Altazor", exact: true });
    const start = panel.getByRole("button", { name: "Iniciar escritorio privado", exact: true });
    await expect(start).toBeEnabled();
    await start.click();
    const picker = panel.getByLabel("Sesión de este espacio", { exact: true });
    await expect(picker).toHaveValue(starting.id);
    await expect(picker.locator("option:checked")).toContainText("Escritorio iniciándose");
    await expect.poll(() => Boolean(firstRead)).toBe(true);
    await firstRead!.fulfill({ json: { session: ready, runtime: "container", kittyStatus: "running", working: false, approvals: [], turns: [] } });
    firstRead = undefined;
    await expect(picker.locator("option:checked")).toContainText("Escritorio disponible");
    await expect(panel.getByRole("button", { name: "Mantener sesión 20 min", exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Devolver control", exact: true })).toBeEnabled();
    await expect(start).toBeDisabled();
    await panel.getByRole("button", { name: "Detener escritorio", exact: true }).click();
    await expect(picker.locator(`option[value="${starting.id}"]`)).toContainText("Escritorio detenido");
    await expect(start).toBeEnabled();
    expect(starts).toBe(1);
  } finally { if (firstRead) await firstRead.abort().catch(() => {}); }
});

test("una apertura sin confirmar recupera la sesión pendiente y permite detenerla sin repetir el inicio", async ({ page }) => {
  const uncertain = session("desktop-uncertain-fixture", "unknown");
  let created = false, closed = false, starts = 0, stops = 0, statusReads = 0;
  await idleActivity(page);
  await page.route(`**/api/altazor/connectors?workspaceId=${workspaceId}`, route => route.fulfill({ json: { connectors: emptyInventory } }));
  await page.route("**/api/altazor/computer", route => {
    statusReads++;
    return route.fulfill({ json: { computer: computer(created ? [{ ...uncertain, state: closed ? "closed" : "unknown", requiresStop: !closed }] : []) } });
  });
  await page.route("**/api/altazor/computer/sessions", route => {
    expect(route.request().method()).toBe("POST");
    starts++; created = true;
    return route.fulfill({ status: 503, json: { error: "No se pudo confirmar la apertura del escritorio ficticio." } });
  });
  await page.route(`**/api/altazor/computer/sessions/${uncertain.id}`, route => route.fulfill({ json: { session: { ...uncertain, state: closed ? "closed" : "unknown" }, approvals: [], turns: [] } }));
  await page.route(`**/api/altazor/computer/sessions/${uncertain.id}/actions`, route => {
    expect(route.request().postDataJSON().action).toBe("close");
    stops++; closed = true;
    return route.fulfill({ json: { action: { id: "fixture-stop", status: "completed", result: { stopped: true } } } });
  });
  await loginAs(page, "abogado@estudio.cl");
  await page.goto("/inicio?altazor=computer");
  const panel = page.getByRole("region", { name: "Escritorio de Altazor", exact: true });
  const start = panel.getByRole("button", { name: "Iniciar escritorio privado", exact: true });
  await expect(start).toBeEnabled();
  const readsBeforeStart = statusReads;
  await start.click();
  await expect(panel.getByLabel("Sesión de este espacio", { exact: true })).toHaveValue(uncertain.id);
  await expect(panel.getByLabel("Sesión de este espacio", { exact: true }).locator("option:checked")).toContainText("Creación sin confirmar");
  await expect(panel.getByRole("button", { name: "Detener escritorio", exact: true })).toBeEnabled();
  await expect(start).toBeDisabled();
  expect(statusReads).toBeGreaterThan(readsBeforeStart);
  expect(starts).toBe(1);
  await panel.getByRole("button", { name: "Detener escritorio", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("confirmó que detuvo este escritorio");
  await expect(start).toBeEnabled();
  expect(starts).toBe(1);
  expect(stops).toBe(1);
});

test("una comprobación fallida de conectores invalida el estado anterior hasta una respuesta nueva", async ({ page }) => {
  const kind = CONNECTOR_CATALOG.find(item => item.id === "ntfy")!;
  const inventory: ConnectorInventory = {
    ...emptyInventory,
    catalog: [{ ...kind, fields: [{ name: "topic", label: "Tema", secret: false, required: true }], available: true, oauthReady: false }],
    connections: [{ name: "ntfy-fixture", kind: "ntfy", signedIn: true, needsSignIn: false, configured: true, ownAppConfigured: false, secretFields: [], auth: null, usedBy: [] }],
  };
  let fail = false, connectorReads = 0;
  let pendingCheck: Route | undefined;
  const mutations: string[] = [];
  await idleActivity(page);
  await page.route("**/api/altazor/computer", route => route.fulfill({ json: { computer: computer([]) } }));
  await page.route(`**/api/altazor/connectors?workspaceId=${workspaceId}`, route => {
    connectorReads++;
    if (fail) { pendingCheck = route; return; }
    return route.fulfill({ json: { connectors: inventory } });
  });
  page.on("request", request => { if (request.url().includes("/api/altazor/connectors") && request.method() !== "GET") mutations.push(request.url()); });
  await loginAs(page, "abogado@estudio.cl");
  await page.goto("/inicio?altazor=connectors");
  const catalog = page.getByTestId("altazor-connector-catalog");
  await catalog.getByRole("button", { name: /^ntfy \(push\)/ }).click();
  const save = catalog.getByRole("button", { name: "Guardar conexión", exact: true });
  const probe = catalog.getByRole("button", { name: "Probar acceso", exact: true });
  await expect(save).toBeEnabled();
  await expect(probe).toBeEnabled();
  await expect(catalog.getByRole("button", { name: "ntfy-fixture · Guardada · sin comprobar", exact: true })).toBeVisible();
  fail = true;
  await catalog.getByRole("button", { name: "Comprobar estado", exact: true }).click();
  await expect.poll(() => Boolean(pendingCheck)).toBe(true);
  await expect(save).toBeDisabled();
  await expect(probe).toBeDisabled();
  await expect(catalog.getByRole("button", { name: "Comprobar estado", exact: true })).toBeDisabled();
  await pendingCheck!.fulfill({ status: 503, json: { error: "No se pudo comprobar el gateway ficticio." } });
  pendingCheck = undefined;
  await expect(catalog.getByRole("alert")).toContainText("No se pudo comprobar el gateway ficticio.");
  await expect(save).toBeDisabled();
  await expect(probe).toBeDisabled();
  await expect(catalog.getByText("Permisos por uso activos", { exact: true })).toHaveCount(0);
  await expect(catalog.getByRole("button", { name: /ntfy-fixture.*Sesión autorizada/ })).toHaveCount(0);
  await expect(catalog.getByRole("button", { name: "ntfy-fixture · Estado sin comprobar", exact: true })).toBeVisible();
  fail = false;
  await catalog.getByRole("button", { name: "Comprobar estado", exact: true }).click();
  await expect(save).toBeEnabled();
  await expect(probe).toBeEnabled();
  await expect(catalog.getByRole("button", { name: "ntfy-fixture · Guardada · sin comprobar", exact: true })).toBeVisible();
  expect(connectorReads).toBeGreaterThanOrEqual(3);
  expect(mutations).toEqual([]);
});

test("una prueba de acceso confirma sólo esa cuenta y se invalida al actualizar o recargar", async ({ page }) => {
  const kind = CONNECTOR_CATALOG.find(item => item.id === "ntfy")!;
  const inventory: ConnectorInventory = {
    ...emptyInventory,
    catalog: [{ ...kind, fields: [{ name: "topic", label: "Tema", secret: false, required: true }], available: true, oauthReady: false }],
    connections: ["ntfy-primary", "ntfy-secondary"].map(name => ({ name, kind: "ntfy", signedIn: true, needsSignIn: false, configured: true, ownAppConfigured: false, secretFields: [], auth: null, usedBy: [] })),
  };
  const mutations: string[] = [];
  await idleActivity(page);
  await page.route("**/api/altazor/computer", route => route.fulfill({ json: { computer: computer([]) } }));
  await page.route(`**/api/altazor/connectors?workspaceId=${workspaceId}`, route => route.fulfill({ json: { connectors: inventory } }));
  await page.route("**/api/altazor/connectors/ntfy-primary/test", route => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toMatchObject({ workspaceId, confirmed: true });
    return route.fulfill({ json: { test: { ok: true, tested: true } } });
  });
  page.on("request", request => { if (request.url().includes("/api/altazor/connectors") && request.method() !== "GET") mutations.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  await loginAs(page, "abogado@estudio.cl");
  await page.goto("/inicio?altazor=connectors");
  const catalog = page.getByTestId("altazor-connector-catalog");
  await catalog.getByRole("button", { name: /^ntfy \(push\)/ }).click();
  const saved = (name: string) => catalog.getByRole("button", { name: `${name} · Guardada · sin comprobar`, exact: true });
  const verified = catalog.getByRole("button", { name: "ntfy-primary · Acceso comprobado", exact: true });
  await expect(saved("ntfy-primary")).toBeVisible(); await expect(saved("ntfy-secondary")).toBeVisible();
  await catalog.getByRole("button", { name: "Probar acceso", exact: true }).click();
  await expect(verified).toBeVisible();
  await expect(saved("ntfy-secondary")).toBeVisible();
  await expect(catalog.getByRole("status").filter({ hasText: "El servicio confirmó el acceso." })).toBeVisible();
  await catalog.getByRole("button", { name: "Comprobar estado", exact: true }).click();
  await expect(saved("ntfy-primary")).toBeVisible(); await expect(verified).toHaveCount(0);
  await page.reload();
  await catalog.getByRole("button", { name: /^ntfy \(push\)/ }).click();
  await expect(saved("ntfy-primary")).toBeVisible(); await expect(saved("ntfy-secondary")).toBeVisible();
  await expect(verified).toHaveCount(0);
  expect(mutations).toEqual(["POST /api/altazor/connectors/ntfy-primary/test"]);
});
