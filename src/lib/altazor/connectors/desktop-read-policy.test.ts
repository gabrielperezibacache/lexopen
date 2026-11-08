import assert from "node:assert/strict";
import { easyConnectorReadAllowed } from "./desktop-read-policy";

const google = { kind: "google-workspace" as const, connector: "altazor-google-0123456789abcdef", action: "request" };
const github = { kind: "github" as const, connector: "altazor-github-0123456789abcdef", action: "request" };
for (const args of [
  { action: "request", path: "/drive/v3/files", query: { q: "trashed = false", pageSize: 20 } },
  { action: "request", method: "GET", path: "/drive/v3/files/file_123", query: { alt: "media" } },
  { action: "request", path: "/drive/v3/files/file_123/export?mimeType=text%2Fplain" },
]) assert.equal(easyConnectorReadAllowed({ ...google, args }), true);
for (const args of [
  { action: "request", method: "DELETE", path: "/drive/v3/files/file_123" },
  { action: "request", path: "/gmail/v1/users/me/messages" },
  { action: "request", path: "https://www.googleapis.com/drive/v3/files" },
  { action: "request", path: "/drive/v3/files/../about" },
  { action: "request", path: "/drive/v3/files", body: {} },
  { action: "request", path: "/drive/v3/files", query: { pageSize: 1000 } },
  { action: "request", path: "/drive/v3/files", query: { access_token: "fixture" } },
]) assert.equal(easyConnectorReadAllowed({ ...google, args }), false);
for (const args of [
  { action: "request", path: "/user/repos", query: { visibility: "public", per_page: 20 } },
  { action: "request", path: "/users/person/repos" },
  { action: "request", path: "/repos/person/repo/contents/docs/intro.md", query: { ref: "main" } },
]) assert.equal(easyConnectorReadAllowed({ ...github, args }), true);
assert.equal(easyConnectorReadAllowed({ ...github, action: "get_file", args: { action: "get_file", repo: "person/repo", path: "README.md" } }), true);
assert.equal(easyConnectorReadAllowed({ ...google, action: "download_file", args: { action: "download_file", id: "file_123", name: "Resolution.pdf" } }), true);
assert.equal(easyConnectorReadAllowed({ ...google, action: "download_file", args: { action: "download_file", id: "file_123", format: "text" } }), true);
assert.equal(easyConnectorReadAllowed({ ...github, action: "download_file", args: { action: "download_file", repo: "person/repo", path: "docs/README.md" } }), true);
assert.equal(easyConnectorReadAllowed({ ...github, action: "download_file", args: { action: "download_file", repo: "person/repo", path: "README.md", name: ".bashrc" } }), false);
for (const args of [
  { action: "request", path: "/user/repos" },
  { action: "request", path: "/user/repos", query: { visibility: "private" } },
  { action: "request", path: "/user/emails" },
  { action: "request", path: "/repos/person/repo/contents/%2e%2e/secrets" },
  { action: "request", path: "/repos/person/repo", method: "POST" },
]) assert.equal(easyConnectorReadAllowed({ ...github, args }), false);
assert.equal(easyConnectorReadAllowed({ ...github, action: "create_pr", args: { action: "create_pr", repo: "person/repo" } }), false);
assert.equal(easyConnectorReadAllowed({ ...github, action: "get_file", args: { action: "get_file", repo: "person/../other", path: "README.md" } }), false);
assert.equal(easyConnectorReadAllowed({ ...github, connector: "advanced-github", action: "create_pr", args: { action: "create_pr", repo: "person/repo" } }), true);
console.log("Easy desktop connections allow scoped file reads and reject writes, other APIs and path escapes PASS.");
