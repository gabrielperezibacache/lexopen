import assert from "node:assert/strict";
import test from "node:test";
import { CONNECTOR_CATALOG } from "./catalog";
import { connectorAvailability, connectorConnectionAvailability } from "./availability";
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
