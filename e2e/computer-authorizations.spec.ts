import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_COMPUTER_AUTHORIZATION } from "../src/lib/altazor/computer/authorization-policy";
import type { ComputerAuthorizationView, ComputerSessionSummary, ComputerStatus, ComputerUseApproval } from "../src/lib/altazor/computer/types";
import { loginAs } from "./helpers";

// Fictitious accounts and mocked native replies; no containers or providers.
const workspaceId = "authorization-ui-fixture", sessionId = "authorization-desktop-fixture";
const endpoint = "/api/altazor/computer/authorization";
function initial(): ComputerAuthorizationView { return { workspaceId, revision: 0, desired: { ...DEFAULT_COMPUTER_AUTHORIZATION }, applied: null, sessionId: null, state: "default", canConfigure: true }; }
async function blockExternal(page: Page) { await page.context().route("**/*", route => { const url = new URL(route.request().url()); return ["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname) ? route.abort() : route.continue(); }); }

test("las autorizaciones se eligen explícitamente y las categorías no se conceden al cambiar de modo", async ({ page }, info) => {
  await blockExternal(page);
  let view = initial(); const writes: Record<string, unknown>[] = [];
  await page.route(`**${endpoint}*`, route => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON(); writes.push(body);
      view = { ...view, revision: 1, desired: body.choice, state: "saved" };
      return route.fulfill({ json: { status: "completed", authorization: view } });
    }
    return route.fulfill({ json: { workspaces: [{ id: workspaceId, label: "Mi espacio personal", causaId: null }], authorization: view, localConfiguration: true } });
  });
  await loginAs(page, "abogado@estudio.cl"); await page.goto("/configuracion#autorizaciones-escritorio");
  const panel = page.getByRole("region", { name: "Autorizaciones del escritorio", exact: true });
  await expect(panel).toBeVisible(); expect(writes).toHaveLength(0);
  await panel.getByRole("radio", { name: /Trabajo autónomo/ }).check();
  const input = panel.getByRole("checkbox", { name: /Ratón y teclado/ });
  await expect(input).not.toBeChecked(); await input.check();
  const confirm = panel.getByRole("checkbox", { name: /Confirmo esta elección/ }); await confirm.check();
  await expect(panel.getByRole("button", { name: "Guardar para el próximo escritorio" })).toBeDisabled();
  await panel.getByRole("checkbox", { name: /Entiendo que permitir ratón y teclado/ }).check();
  await panel.getByRole("button", { name: "Guardar para el próximo escritorio" }).click();
  expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ workspaceId, choice: { mode: "autonomous", allowInput: true, allowBrowser: false, allowApps: false, guiEffectsAcknowledged: true, confirmed: true, expectedRevision: 0 } });
  await expect(panel.getByText("Guardado para el próximo escritorio", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText("Aplicado y confirmado por el escritorio", { exact: true })).toHaveCount(0);
  await panel.getByRole("radio", { name: /Consultas inteligentes/ }).check(); await expect(input).not.toBeChecked(); await expect(input).toBeDisabled();
  for (const [label, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 360, height: 800 }]] as const) {
    await page.setViewportSize(viewport); await panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await panel.screenshot({ path: info.outputPath(`computer-authorizations-${label}.png`) });
  }
});

test("un resultado incierto no repite PUT al comprobar su estado en Configuración", async ({ page }) => {
  await blockExternal(page); let writes = 0, view = initial();
  await page.route(`**${endpoint}*`, route => {
    if (route.request().method() === "PUT") { writes++; view = { ...view, revision: 1, state: "unknown", reason: "El cambio no quedó confirmado. Comprueba el escritorio." }; return route.fulfill({ status: 502, json: { error: "No se confirmó la aplicación exacta." } }); }
    return route.fulfill({ json: { workspaces: [{ id: workspaceId, label: "Mi espacio personal", causaId: null }], authorization: view, localConfiguration: true } });
  });
  await loginAs(page, "abogado@estudio.cl"); await page.goto("/configuracion#autorizaciones-escritorio");
  const panel = page.getByRole("region", { name: "Autorizaciones del escritorio", exact: true });
  await panel.getByRole("radio", { name: /Consultas inteligentes/ }).check(); await panel.getByRole("checkbox", { name: /Confirmo esta elección/ }).check();
  await panel.getByRole("button", { name: "Guardar para el próximo escritorio" }).click();
  await expect(panel.getByText("Resultado sin confirmar", { exact: true })).toBeVisible();
  const checked = page.waitForResponse(response => new URL(response.url()).pathname === endpoint && response.request().method() === "GET");
  await panel.getByRole("button", { name: "Comprobar estado" }).click();
  await (await checked).finished();
  await expect(panel.getByRole("button", { name: "Guardar para el próximo escritorio" })).toBeDisabled();
  expect(writes).toBe(1);
});

test("la consulta del computador aparece bajo el chat y autoriza sólo el hash y la revisión mostrados", async ({ page }) => {
  await blockExternal(page);
  const session: ComputerSessionSummary = { id: sessionId, state: "ready", expiresAt: "2030-05-06T18:00:00Z", renewableUntil: "2030-05-06T19:00:00Z", canRenew: false, held: false, createdAt: "2030-05-06T17:00:00Z", connectors: [], requiresStop: true };
  const computer: ComputerStatus = { enabled: true, configured: true, policyAllowed: true, canConfigure: true, state: "configured", workspaceId, provider: "synthetic-policy", version: "synthetic.11", lastVerifiedAt: null, reason: null, runtime: "container", sessions: [session] };
  const authorization: ComputerAuthorizationView = { ...initial(), revision: 1, desired: { ...DEFAULT_COMPUTER_AUTHORIZATION, mode: "intelligent" }, state: "applied", sessionId, applied: { applied: true, chatId: "synthetic-chat", kittyId: "synthetic-kitty", binding: "a".repeat(64), mode: "intelligent", revision: 2, allowInput: false, allowBrowser: false, allowApps: false, maxActions: 100, maxConsultations: 20, actionsUsed: 1, consultationsUsed: 1, guiEffectsUnknown: false, outcomeUnknown: false } };
  const approval: ComputerUseApproval = { id: "synthetic-approval", kind: "computer-use", connector: "lexopen-computer-use", action: "key", args: { keys: "Return" }, kittyId: "synthetic-kitty", chatId: "synthetic-chat", status: "pending", reviewable: true, at: "", summary: "Pulsar una tecla", computerAction: { version: "v1", binding: "a".repeat(64), policyRevision: 2, category: "input", reason: "Confirma esta acción de ratón o teclado; puede producir cambios en la aplicación abierta.", effectUnknown: true, actionHash: "b".repeat(64) } };
  const decisions: Record<string, unknown>[] = []; let pending = true;
  await page.route("**/api/altazor/computer/activity*", route => route.fulfill({ json: { state: pending ? "approval" : "ready", monitor: true, sessionId, consultation: pending ? { action: "key", reason: approval.computerAction.reason, effectUnknown: true } : undefined } }));
  await page.route(/\/api\/altazor\/computer(?:\?.*)?$/, route => route.fulfill({ json: { computer } }));
  await page.route(`**/api/altazor/connectors?workspaceId=${workspaceId}`, route => route.fulfill({ json: { connectors: { catalog: [], connections: [], gateReady: true, version: "synthetic.11" } } }));
  await page.route(`**/api/altazor/computer/sessions/${sessionId}`, route => route.fulfill({ json: { session, working: false, turns: [], approvals: pending ? [approval] : [], authorization } }));
  await page.route(`**/api/altazor/computer/sessions/${sessionId}/screenshot*`, route => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ioAAAAASUVORK5CYII=", "base64") }));
  await page.route(`**/api/altazor/computer/sessions/${sessionId}/actions`, route => { decisions.push(route.request().postDataJSON()); pending = false; return route.fulfill({ json: { action: { id: "synthetic-decision", status: "completed", result: { state: "executed", semanticOutcomeVerified: false } } } }); });
  await loginAs(page, "abogado@estudio.cl"); await page.goto("/inicio");
  const monitor = page.getByRole("region", { name: "Escritorio de Altazor", exact: true }).filter({ has: page.getByRole("button", { name: "Revisar acción", exact: true }) });
  await monitor.scrollIntoViewIfNeeded(); await expect(monitor.getByText(approval.computerAction.reason)).toBeVisible(); await monitor.getByRole("button", { name: "Revisar acción", exact: true }).click();
  const panel = page.getByRole("region", { name: "Escritorio de Altazor", exact: true }).filter({ has: page.getByLabel("Sesión de este espacio", { exact: true }) });
  await expect(panel.getByText("Acción en el computador: Pulsar una tecla", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Autorizar esta acción", exact: true }).click();
  expect(decisions).toHaveLength(1); expect(decisions[0]).toMatchObject({ action: "computer_approval", approvalId: approval.id, approve: true, confirmed: true, actionHash: "b".repeat(64), policyRevision: 2 });
  await expect(panel.getByText("El computador ejecutó esta acción una vez. Comprueba su efecto en el monitor.", { exact: true })).toBeVisible();
});
