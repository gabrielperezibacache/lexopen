import assert from "node:assert/strict";
import test from "node:test";
import { CONNECTOR_CATALOG } from "./catalog";
import { connectorAccountAvailability, connectorAvailability, connectorConnectionAvailability, connectorOAuthSnapshot } from "./availability";
import { connectorAccountPresentation } from "./presentation";
import type { ConnectorCatalogEntry, ConnectorConnection } from "./types";

const entry: ConnectorCatalogEntry = { ...CONNECTOR_CATALOG.find(item => item.id === "dropbox")!, available: true, oauthReady: false, fields: [] };
const saved: ConnectorConnection = { name: "files", kind: "dropbox", signedIn: true, needsSignIn: false, configured: true, ownAppConfigured: true, secretFields: ["token"], auth: "sign-in", usedBy: [] };

test("adapter availability never claims that an account has connected", () => {
  assert.deepEqual(connectorAvailability(entry, [], false), { state: "unknown", label: "Disponibilidad sin comprobar" });
  assert.equal(connectorAvailability(entry, [], true).state, "available");
  assert.equal(connectorAvailability({ ...entry, available: false }, [saved], true).state, "unavailable");
  assert.equal(connectorAvailability({ ...entry, blockedReason: "blocked" }, [saved], true, { files: { tested: true, ok: true } }).state, "unavailable");
});
test("stored keys and signed-in flags do not prove access", () => {
  assert.equal(connectorConnectionAvailability(saved, true).state, "saved");
  assert.equal(connectorConnectionAvailability(saved, false, { tested: true, ok: true }).state, "unknown");
  assert.equal(connectorConnectionAvailability({ ...saved, needsSignIn: true }, true, { tested: true, ok: true }).state, "sign_in");
  assert.equal(connectorConnectionAvailability({ ...saved, configured: false }, true, { tested: true, ok: true }).label, "Configuración incompleta");
});
test("only a completed successful access check is shown as verified", () => {
  assert.equal(connectorConnectionAvailability(saved, true, { tested: true, ok: true }).state, "verified");
  assert.equal(connectorConnectionAvailability(saved, true, { tested: true, ok: false }).state, "failed");
  assert.equal(connectorConnectionAvailability(saved, true, { tested: false, ok: true }).state, "unsupported_test");
  assert.equal(connectorConnectionAvailability(saved, true, { tested: false, ok: false }).state, "unsupported_test");
});
test("a successful account cannot make all accounts look verified", () => {
  const other = { ...saved, name: "other" };
  assert.equal(connectorAvailability(entry, [saved, other], true, { files: { tested: true, ok: true } }).label, "1 de 2 accesos comprobados");
  assert.equal(connectorAvailability(entry, [saved, { ...other, kind: "rss" }], true).label, "Guardada · sin comprobar");
  assert.equal(connectorAvailability(entry, [saved, other], true).state, "saved");
});

const oauth = { workspaceId: "personal-files", causaId: null, providers: [{ provider: "dropbox", available: true, state: "connected", connected: true, tested: true, hasStoredConnection: true }] };
test("guided accounts require checked OAuth evidence for this exact workspace", () => {
  const snapshot = connectorOAuthSnapshot(oauth, "personal-files", null);
  assert.ok(snapshot);
  assert.equal(connectorAccountAvailability(entry, true, snapshot).state, "verified");
  assert.equal(connectorAccountAvailability(entry, false, snapshot).state, "unknown");
  assert.equal(connectorAccountAvailability(entry, true, null).state, "unknown");
  assert.equal(connectorAccountAvailability({ ...entry, available: false }, true, snapshot).state, "unavailable");
  assert.equal(connectorOAuthSnapshot(oauth, "other-workspace", null), null);
  assert.equal(connectorOAuthSnapshot(oauth, "personal-files", "another-case"), null);
  for (const malformed of [
    { ...oauth, providers: [oauth.providers[0], oauth.providers[0]] },
    { ...oauth, providers: [{ ...oauth.providers[0], tested: "true" }] },
    { ...oauth, providers: [{ ...oauth.providers[0], provider: "other" }] },
    { ...oauth, providers: [{ ...oauth.providers[0], state: "made-up" }] },
  ]) assert.equal(connectorOAuthSnapshot(malformed, "personal-files", null), null);
});
test("guided account readiness and uncertainty are separate from stored credentials", () => {
  const status = (overrides: Record<string, unknown>) => connectorAccountAvailability(entry, true,
    connectorOAuthSnapshot({ ...oauth, providers: [{ ...oauth.providers[0], ...overrides }] }, "personal-files", null));
  assert.equal(status({ tested: false }).state, "saved");
  assert.equal(status({ connected: false }).state, "saved");
  assert.equal(status({ state: "idle", connected: false, tested: false, hasStoredConnection: false }).label, "Iniciar sesión");
  assert.equal(status({ state: "blocked", available: false }).label, "Servicio en preparación");
  assert.equal(status({ state: "pending" }).label, "Ingreso pendiente");
  assert.equal(status({ state: "unavailable" }).label, "Conexión sin comprobar");
  assert.equal(status({ state: "expired" }).label, "Vuelve a conectar");
  assert.equal(status({ state: "reconnect_required" }).label, "Vuelve a conectar");
  assert.equal(status({ state: "failed" }).state, "failed");
});
test("guided account copy describes read-only access without changing adapter capabilities", () => {
  const google = CONNECTOR_CATALOG.find(item => item.id === "google-workspace")!;
  const github = CONNECTOR_CATALOG.find(item => item.id === "github")!;
  const slack = CONNECTOR_CATALOG.find(item => item.id === "slack")!;
  assert.equal(connectorAccountPresentation(google).label, "Google Drive");
  assert.doesNotMatch(connectorAccountPresentation(google).description, /sin modificarlos/);
  assert.doesNotMatch(connectorAccountPresentation(google).description, /correo|calendario/i);
  assert.match(connectorAccountPresentation(github).description, /repositorios públicos/);
  assert.doesNotMatch(connectorAccountPresentation(github).description, /privados|publicar|crear/i);
  assert.deepEqual(connectorAccountPresentation(slack), { label: slack.label, description: slack.description });
  assert.equal(google.label, "Google Workspace");
  assert.match(google.description, /Correo/);
});
test("Drive management copy follows checked account permissions rather than adapter features", () => {
  const google = CONNECTOR_CATALOG.find(item => item.id === "google-workspace")!;
  const account = { connected: true, tested: true, canReadFiles: true, canManageFiles: true };
  assert.match(connectorAccountPresentation(google, account).description, /encargos que autorices/);
  assert.match(connectorAccountPresentation(google, { ...account, canManageFiles: false }).description, /sin modificarlos/);
  assert.match(connectorAccountPresentation(google, { ...account, canReadFiles: false, canManageFiles: false }).description, /datos básicos/);
  for (const unverified of [{ ...account, tested: false }, { ...account, connected: false }]) assert.doesNotMatch(connectorAccountPresentation(google, unverified).description, /crea|edita/);
  const snapshot = connectorOAuthSnapshot({ ...oauth, providers: [{ ...oauth.providers[0], provider: "google", canManageFiles: true }] }, "personal-files", null);
  assert.equal(snapshot?.providers[0].canManageFiles, false, "legacy or incomplete status cannot claim management");
});
