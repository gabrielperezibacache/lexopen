import assert from "node:assert/strict";
import test from "node:test";
import { locationForAltazorPane } from "./pane-location";

const href = "http://127.0.0.1:3485/inicio?altazor=connectors&connector=google-workspace&oauthAttempt=fixture-attempt&oauthProvider=google&oauth=failed&conversacion=fixture-conversation&causaId=fixture-cause&documentoId=fixture-document&keep=fixture#position";
test("returning to the conversation clears only the abandoned application navigation", () => {
  const result = new URL(locationForAltazorPane(href, "chat")!, "http://127.0.0.1:3485");
  for (const key of ["altazor", "connector", "oauthAttempt", "oauthProvider", "oauth"]) assert.equal(result.searchParams.has(key), false);
  for (const [key, value] of [["conversacion", "fixture-conversation"], ["causaId", "fixture-cause"], ["documentoId", "fixture-document"], ["keep", "fixture"]]) assert.equal(result.searchParams.get(key), value);
  assert.equal(result.hash, "#position");
});
test("opening another assistant tool replaces the pane without restoring an old application", () => {
  for (const pane of ["computer", "memory", "icaros", "help"] as const) {
    const result = new URL(locationForAltazorPane(href, pane)!, "http://127.0.0.1:3485");
    assert.equal(result.searchParams.get("altazor"), pane); assert.equal(result.searchParams.has("oauthAttempt"), false);
    assert.equal(result.searchParams.get("conversacion"), "fixture-conversation");
    const returned = new URL(locationForAltazorPane(result.href, "chat")!, result.origin);
    assert.equal(returned.searchParams.has("altazor"), false); assert.equal(returned.searchParams.get("causaId"), "fixture-cause");
  }
});
test("the original account return is preserved while Applications remains open", () => {
  assert.equal(locationForAltazorPane(href, "connectors"), new URL(href).pathname + new URL(href).search + new URL(href).hash);
  const outside = "http://127.0.0.1:3485/academico?causaId=fixture-cause&keep=fixture";
  assert.equal(locationForAltazorPane(outside, "chat"), null);
});
