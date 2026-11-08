import assert from "node:assert/strict";
import test from "node:test";
import { easyOAuthScopes, validEasyOAuthScopes, canReadConnectorFiles } from "./oauth-access";
import { validatePersistentEasyOAuth, type PersistentEasyOAuthConfiguration } from "./persistent-oauth";
import { easyConnectorReadAllowed } from "./desktop-read-policy";

const microsoft = (): PersistentEasyOAuthConfiguration => ({ kind: "microsoft-365", publicClient: true, clientId: "12345678-abcd-1234-abcd-123456789abc", clientSecret: "", accessToken: "fictitious-access", refreshToken: "fictitious-refresh", expiresAt: new Date(Date.now() + 3600_000).toISOString(), scopes: ["Files.Read", "User.Read"] });
test("public cloud identities require no secret and exact API read grants", () => {
  assert.equal(validatePersistentEasyOAuth(microsoft()).publicClient, true);
  assert.deepEqual(easyOAuthScopes("microsoft"), ["Files.Read", "User.Read"]);
  assert.equal(canReadConnectorFiles("microsoft", ["Files.Read", "User.Read"]), true);
  assert.equal(validEasyOAuthScopes("microsoft", ["Files.Read", "User.Read", "Mail.Read"]), false);
  assert.throws(() => easyOAuthScopes("microsoft", "files"));
  for (const value of [
    { ...microsoft(), clientSecret: "operator-secret-is-not-a-public-client" },
    { ...microsoft(), publicClient: false }, { ...microsoft(), clientId: "not-a-guid" },
    { ...microsoft(), scopes: ["Files.ReadWrite", "User.Read"] }, { ...microsoft(), scopes: ["Files.Read", "User.Read", "offline_access"] },
    { ...microsoft(), refreshToken: "" }, { ...microsoft(), kind: "google-workspace" as const },
  ]) assert.throws(() => validatePersistentEasyOAuth(value), error => (error as { code?: string }).code === "oauth_persistence_invalid");
  assert.equal(validatePersistentEasyOAuth({ ...microsoft(), kind: "dropbox", clientId: "fictitiousDropboxPublic", scopes: ["account_info.read", "files.metadata.read", "files.content.read"] }).publicClient, true);
});

const ms = { kind: "microsoft-365" as const, connector: "altazor-microsoft-0123456789abcdef" };
const dbx = { kind: "dropbox" as const, connector: "altazor-dropbox-0123456789abcdef" };
test("OneDrive approvals allow only bounded file operations and selected metadata", () => {
  for (const args of [
    { action: "download_file", id: "01ABC!FILE123", name: "Syllabus.pdf" },
    { action: "list", limit: "50" }, { action: "list", id: "01ABC", limit: "1" },
    { action: "search", query: "Investigación jurídica", limit: "20" },
    { action: "request", path: "/v1.0/me/drive/root/children", query: { "$top": "25", "$select": "id,name,size,file", "$orderby": "lastModifiedDateTime desc" } },
  ]) assert.equal(easyConnectorReadAllowed({ ...ms, action: args.action, args }), true);
  for (const args of [
    { action: "send_mail", to: "person@fixture.invalid" }, { action: "upload", id: "01ABC" },
    { action: "request", method: "POST", path: "/v1.0/me/drive/root/children" },
    { action: "request", path: "/v1.0/me/messages" }, { action: "request", path: "/v1.0/me/drive/items/01ABC/content" },
    { action: "request", path: "/v1.0/me/drive/root/children", query: { "$select": "@microsoft.graph.downloadUrl" } },
    { action: "request", path: "/v1.0/me/drive/root/children", query: { "$filter": "any arbitrary expression" } },
    { action: "request", path: "/v1.0/me/drive/root/../items/private" },
    { action: "download_file", id: "../escape" }, { action: "download_file", id: "01ABC", url: "https://fixture.invalid" },
    { action: "list", limit: "51" }, { action: "search", query: "x", limit: 10 },
  ]) assert.equal(easyConnectorReadAllowed({ ...ms, action: args.action, args }), false);
});
test("Dropbox generated connections cannot use generic API, traversal or write operations", () => {
  for (const args of [{ action: "read", path: "/Curso/Resolución.pdf" }, { action: "download_file", path: "/Curso/Notas.pdf" }, { action: "list", path: "", limit: "20" }, { action: "search", query: "congreso" }]) assert.equal(easyConnectorReadAllowed({ ...dbx, action: args.action, args }), true);
  for (const args of [{ action: "request", path: "/2/files/delete_v2" }, { action: "upload", path: "/x" }, { action: "read", path: "/../private" }, { action: "read", path: "/x%2Fy" }, { action: "read", path: "/x", token: "hidden" }, { action: "download_file", path: "/" }]) assert.equal(easyConnectorReadAllowed({ ...dbx, action: args.action, args }), false);
  assert.equal(easyConnectorReadAllowed({ ...ms, kind: "google-workspace", action: "download_file", args: { action: "download_file", id: "01ABC" } }), false);
  assert.equal(easyConnectorReadAllowed({ ...dbx, kind: "http", action: "call", args: { action: "call", path: "/outside" } }), false);
});
