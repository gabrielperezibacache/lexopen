import assert from "node:assert/strict";
import { test } from "node:test";
import { canManageConnectorFiles, canReadConnectorFiles, easyOAuthScopes, GOOGLE_FILES_SCOPE, GOOGLE_MANAGE_SCOPE, GOOGLE_METADATA_SCOPE, validEasyOAuthScopes } from "./oauth-access";

test("Drive file reading requires its own consent and never grants writes", () => {
  assert.deepEqual(easyOAuthScopes("google"), [GOOGLE_METADATA_SCOPE]);
  assert.deepEqual(easyOAuthScopes("google", "files"), [GOOGLE_FILES_SCOPE]);
  assert.equal(canReadConnectorFiles("google", easyOAuthScopes("google")), false);
  assert.equal(canReadConnectorFiles("google", easyOAuthScopes("google", "files")), true);
  for (const provider of ["github", "dropbox"] as const) assert.throws(() => easyOAuthScopes(provider, "files"));
});
test("only exact supported scope profiles can return from OAuth", () => {
  for (const scopes of [[GOOGLE_METADATA_SCOPE], [GOOGLE_FILES_SCOPE], [GOOGLE_MANAGE_SCOPE]]) assert.equal(validEasyOAuthScopes("google", scopes), true);
  for (const scopes of [[], [GOOGLE_FILES_SCOPE, GOOGLE_METADATA_SCOPE], [GOOGLE_FILES_SCOPE, GOOGLE_FILES_SCOPE], [GOOGLE_MANAGE_SCOPE, GOOGLE_FILES_SCOPE], [GOOGLE_MANAGE_SCOPE, "https://www.googleapis.com/auth/calendar"], null, "read:user"]) assert.equal(validEasyOAuthScopes("google", scopes), false);
  assert.equal(validEasyOAuthScopes("github", ["read:user"]), true);
  assert.equal(validEasyOAuthScopes("github", ["repo"]), false);
});
test("Drive management requires an explicit separate grant, without changing old defaults or other accounts", () => {
  assert.deepEqual(easyOAuthScopes("google", "manage"), [GOOGLE_MANAGE_SCOPE]);
  assert.deepEqual(easyOAuthScopes("google"), [GOOGLE_METADATA_SCOPE]);
  assert.equal(canReadConnectorFiles("google", [GOOGLE_MANAGE_SCOPE]), true);
  assert.equal(canManageConnectorFiles("google", [GOOGLE_MANAGE_SCOPE]), true);
  for (const scopes of [[GOOGLE_METADATA_SCOPE], [GOOGLE_FILES_SCOPE], [], [GOOGLE_MANAGE_SCOPE, GOOGLE_FILES_SCOPE]]) assert.equal(canManageConnectorFiles("google", scopes), false);
  for (const provider of ["github", "dropbox", "microsoft"] as const) {
    assert.throws(() => easyOAuthScopes(provider, "manage"));
    assert.equal(canManageConnectorFiles(provider, [GOOGLE_MANAGE_SCOPE]), false);
    assert.equal(validEasyOAuthScopes(provider, [GOOGLE_MANAGE_SCOPE]), false);
  }
});
