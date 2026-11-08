import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";
import { CONNECTOR_CATALOG } from "../src/lib/altazor/connectors/catalog";

// UI navigation and a proposed plan only. All assistant/workspace responses are
// synthetic; no real model, account, desktop or approved operation is used.
test("volver de Aplicaciones y del escritorio conserva el contexto y deja visible el plan al enviar", async ({ page }) => {
  const causeId = "pane-fixture-cause", documentId = "pane-fixture-document", conversationId = "pane-fixture-conversation", turnId = "pane-fixture-turn";
  const destination = { provider: "synthetic", model: "fixture", endpoint: "http://127.0.0.1:18999", endpointHash: "fixture", remote: false, permitted: true, key: "pane-fixture-destination" };
  const conversation = { id: conversationId, title: "Causa de prueba", causaId: causeId, scopeKey: `causa:${causeId}`, revision: 0, status: "active" };
  const message = "Prepara un resumen del documento seleccionado.", preview = "Preparar el resumen para revisión humana.";
  let prepared = false, executed = false, preferenceRevision = 0;
  const prepares: Record<string, unknown>[] = [], sends: Record<string, unknown>[] = [], desktopWrites: string[] = [];
  const turn = { id: turnId, ordinal: 1, status: "awaiting_confirmation", userText: message, assistantText: "Revisa el plan antes de continuar.", attachmentIds: [], sourceRefs: [], results: [], plan: { id: "pane-fixture-plan", steps: [{ toolId: "escritorio", preview }] }, errorCode: null, createdAt: "2030-05-06T17:00:00Z" };
  const data = () => ({ conversation: { ...conversation, revision: executed ? 1 : 0 }, turns: executed ? [turn] : [], attachments: [], destination, hasMore: false, beforeOrdinal: null });
  await page.context().route("**/*", route => {
    const url = new URL(route.request().url());
    return ["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname) ? route.abort() : route.continue();
  });
  await page.route(/\/api\/altazor\/resources(?:\?.*)?$/, route => route.fulfill({ json: { causas: [{ id: causeId, titulo: conversation.title, rit: "C-123-2030" }] } }));
  await page.route("**/api/altazor/companion", route => {
    if (route.request().method() === "PATCH") preferenceRevision++;
    return route.fulfill({ json: { activeConversationId: prepared ? conversationId : null, selectionUnavailable: false, memoryEnabled: true, backgroundEnabled: true, revision: preferenceRevision } });
  });
  await page.route(/\/api\/altazor\/conversations(?:\/[^?]*)?(?:\?.*)?$/, route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/api/altazor/conversations/prepare") { prepares.push(request.postDataJSON()); prepared = true; return route.fulfill({ json: { conversation } }); }
    if (path === `/api/altazor/conversations/${conversationId}/turns`) { sends.push(request.postDataJSON()); return route.fulfill({ json: { turnId } }); }
    if (path === `/api/altazor/conversations/${conversationId}/turns/${turnId}/execute`) { executed = true; return route.fulfill({ json: data() }); }
    if (path === "/api/altazor/conversations") return route.fulfill({ json: { conversations: prepared ? [conversation] : [], destination } });
    return route.fulfill({ json: data() });
  });
  await page.route("**/api/altazor/timeline*", route => route.fulfill({ json: { turns: executed ? [{ ...turn, conversationId, conversationTitle: conversation.title, conversationStatus: "active", causaId: causeId }] : [], before: null } }));
  await page.route("**/api/altazor/computer/activity", route => route.fulfill({ json: { state: "idle", sessionId: null, monitor: false } }));
  await page.route(/\/api\/altazor\/computer(?:\?.*)?$/, route => route.fulfill({ json: { computer: { enabled: true, configured: true, policyAllowed: true, canConfigure: true, state: "configured", workspaceId: "pane-fixture-workspace", provider: "fixture", version: "synthetic", runtime: "container", lastVerifiedAt: null, reason: null, sessions: [] } } }));
  await page.route("**/api/altazor/connectors?*", route => route.fulfill({ json: { connectors: { catalog: [], connections: [], gateReady: true, version: "synthetic" } } }));
  page.on("request", request => { if (/\/api\/altazor\/(computer|connectors)/.test(request.url()) && request.method() !== "GET") desktopWrites.push(request.url()); });
  await loginAs(page, "abogado@estudio.cl");
  await page.goto(`/inicio?altazor=connectors&connector=google-workspace&oauthAttempt=pane-fixture-attempt&oauthProvider=google&causaId=${causeId}&documentoId=${documentId}&keep=pane-fixture`);
  await expect(page.getByRole("heading", { name: "Aplicaciones", exact: true })).toBeVisible();
  const composer = page.getByTestId("inicio-composer");
  await page.getByRole("button", { name: "Volver a la conversación", exact: true }).click();
  const afterClose = new URL(page.url());
  for (const key of ["altazor", "connector", "oauthAttempt", "oauthProvider"]) expect(afterClose.searchParams.has(key)).toBe(false);
  expect(afterClose.searchParams.get("causaId")).toBe(causeId); expect(afterClose.searchParams.get("documentoId")).toBe(documentId); expect(afterClose.searchParams.get("keep")).toBe("pane-fixture");
  await composer.fill(message);
  await page.getByLabel("Mi asistente", { exact: true }).click();
  await page.getByRole("button", { name: "Computadora", exact: true }).click();
  await expect(page.getByRole("region", { name: "Escritorio de Altazor", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver a la conversación", exact: true }).click();
  await expect(composer).toHaveValue(message);
  await page.getByTestId("inicio-send").click();
  await expect(page.getByRole("heading", { name: "Revisa los cambios propuestos", exact: true })).toBeVisible();
  await expect(page.getByText(preview, { exact: true })).toBeVisible();
  await expect(page.getByTestId("plan-confirm")).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Aplicaciones", exact: true })).toBeHidden();
  expect(new URL(page.url()).searchParams.get("conversacion")).toBe(conversationId);
  expect(new URL(page.url()).searchParams.get("keep")).toBe("pane-fixture");
  expect(new URL(page.url()).searchParams.has("altazor")).toBe(false);
  expect(prepares).toHaveLength(1); expect(prepares[0]).toMatchObject({ causaId: causeId, documentoId: documentId });
  expect(sends).toHaveLength(1); expect(sends[0]).toMatchObject({ text: message, documentoId: documentId });
  expect(desktopWrites).toEqual([]);
});

test("Aplicaciones explícitas conserva Dropbox y el retorno OAuth al restaurar una conversación guardada", async ({ page }) => {
  test.setTimeout(45_000);
  const conversationId = "pane-saved-active-fixture", workspaceId = "pane-saved-workspace";
  const conversation = { id: conversationId, title: "Conversación personal guardada", causaId: null, scopeKey: "personal", revision: 3, status: "active" };
  const destination = { provider: "synthetic", model: "fixture", endpoint: "http://127.0.0.1:18999", endpointHash: "fixture", remote: false, permitted: true, key: "pane-fixture-destination" };
  const saved = { activeConversationId: conversationId, selectionUnavailable: false, memoryEnabled: true, backgroundEnabled: true, revision: 4 };
  const data = { conversation, turns: [], attachments: [], destination, hasMore: false, beforeOrdinal: null };
  let armed = false, holdingScopeRefresh = false, resources = 0, details = 0, accountReads = 0;
  let releaseBootstrap!: () => void, releaseResources!: () => void, releaseDetails!: () => void;
  const bootstrap = new Promise<void>(resolve => { releaseBootstrap = resolve; });
  const synchronization = new Promise<void>(resolve => { releaseResources = resolve; });
  const savedDetails = new Promise<void>(resolve => { releaseDetails = resolve; });
  const writes: string[] = [];
  await page.context().route("**/*", route => { const url = new URL(route.request().url()); return ["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname) ? route.abort() : route.continue(); });
  await page.route(/\/api\/altazor\/resources(?:\?.*)?$/, async route => {
    // Strict Mode can start more than one bootstrap request in development.
    if (armed) { resources++; await (holdingScopeRefresh ? synchronization : bootstrap); }
    await route.fulfill({ json: { causas: [] } });
  });
  await page.route("**/api/altazor/companion", async route => { if (armed) await bootstrap; await route.fulfill({ json: saved }); });
  await page.route(/\/api\/altazor\/conversations(?:\?.*)?$/, async route => { if (armed) await bootstrap; await route.fulfill({ json: { conversations: [conversation], destination } }); });
  await page.route(`**/api/altazor/conversations/${conversationId}`, async route => { details++; if (armed) await savedDetails; await route.fulfill({ json: data }); });
  await page.route("**/api/altazor/timeline*", route => route.fulfill({ json: { turns: [], before: null } }));
  await page.route("**/api/altazor/updates*", route => route.fulfill({ json: { updates: [] } }));
  await page.route("**/api/altazor/computer/activity*", route => route.fulfill({ json: { state: "idle", sessionId: null, monitor: false } }));
  await page.route(/\/api\/altazor\/computer(?:\?.*)?$/, route => route.fulfill({ json: { computer: { enabled: true, configured: true, policyAllowed: true, canConfigure: false, state: "configured", workspaceId, provider: "synthetic", version: "synthetic", runtime: "container", lastVerifiedAt: null, reason: null, sessions: [] } } }));
  const dropbox = { ...CONNECTOR_CATALOG.find(entry => entry.id === "dropbox")!, fields: [{ name: "token", label: "Autorización reservada", secret: true, required: false }], available: true, oauthReady: true };
  await page.route("**/api/altazor/connectors?*", route => route.fulfill({ json: { connectors: { catalog: [dropbox], connections: [], gateReady: true, persistentOAuthReady: true, cloudFileOAuthReady: true, version: "synthetic" } } }));
  await page.route("**/api/altazor/connectors/oauth?*", route => { accountReads++; return route.fulfill({ json: { workspaceId, causaId: null, canAdmin: false, requiresStop: false, providers: [{ provider: "dropbox", label: "Dropbox", available: true, reason: null, scopes: ["account_info.read", "files.metadata.read", "files.content.read"], grantedScopes: ["account_info.read", "files.metadata.read", "files.content.read"], canReadFiles: true, autoRefresh: true, persistent: true, connectionName: "altazor-dropbox-0123456789abcdef", state: "connected", connected: true, tested: true, hasStoredConnection: true, canDisconnect: true, expiresAt: null, lastVerifiedAt: "2030-05-06T17:00:00Z" }], attempt: { id: "pane-saved-oauth-attempt", provider: "dropbox", state: "completed", reason: null } } }); });
  page.on("request", request => { if (request.url().includes("/api/altazor/") && request.method() !== "GET") writes.push(request.url()); });
  try {
    await loginAs(page, "abogado@estudio.cl");
    await expect.poll(() => details).toBeGreaterThan(0);
    await page.clock.install(); armed = true;
    const explicit = "/inicio?altazor=connectors&connector=dropbox&oauthAttempt=pane-saved-oauth-attempt&oauthProvider=dropbox&oauth=connected&keep=pane-saved-fixture";
    await page.goto(explicit); await expect.poll(() => resources).toBeGreaterThan(0);
    releaseBootstrap();
    const applications = page.getByRole("heading", { name: "Aplicaciones", exact: true });
    await expect(applications).toBeVisible();
    holdingScopeRefresh = true;
    releaseDetails(); releaseResources();
    const account = page.getByTestId("easy-connector-oauth"); await expect(account.getByRole("heading", { name: "Dropbox conectado", exact: true })).toBeVisible();
    const assertExplicit = async () => {
      await expect(applications).toBeVisible();
      const url = new URL(page.url());
      for (const [key, value] of new URLSearchParams(explicit.split("?")[1])) expect(url.searchParams.get(key)).toBe(value);
      expect(url.searchParams.has("conversacion")).toBe(false);
    };
    await assertExplicit();
    const beforePoll = details; await page.clock.fastForward(16_000); await expect.poll(() => details).toBeGreaterThan(beforePoll);
    const beforeFocus = accountReads;
    await page.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
    await expect.poll(() => accountReads).toBeGreaterThan(beforeFocus); await assertExplicit();
    await page.reload(); await expect(account.getByRole("heading", { name: "Dropbox conectado", exact: true })).toBeVisible(); await assertExplicit();
    expect(writes).toEqual([]);
  } finally { releaseBootstrap(); releaseResources(); releaseDetails(); }
});
