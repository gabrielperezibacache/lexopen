import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hardenConnectors, rewriteConnectorGate, PINNED_COMMIT } from "./harden-connectors.mjs";

const limit = rewriteConnectorGate("internal/chat/limit.go", "unused");
assert.equal(limit.includes("SetRule("), false);
assert.equal(limit.includes('mode = ""'), false);
assert.match(limit, /return outcome\{action: a, err:/);
const gate = rewriteConnectorGate("internal/chat/approve.go", 'if s.approvals == nil {\n\t\treturn outcome{}, false\n\t}\nif !found {\n\t\treturn outcome{}, false\n\t}\nif !isKind {\n\t\treturn outcome{}, false\n\t}\nverdict := s.approvals.Check(k.ID, a.name, action, risk.String(), k.Approvals, s.demandOf(k))');
assert.match(gate, /unavailable"\}, true/);
assert.match(gate, /if !verdict.Blocked/);
assert.match(gate, /verdict = approvals.Verdict\{Why:/);
const health = rewriteConnectorGate("internal/gateway/gateway.go", '\t"net/http"\n\t"strconv"\nout := map[string]any{"ok": true, "version": s.version,');
assert.match(health, /"lexopen_connector_gate": "v1"/);
assert.match(health, /"lexopen_connector_platform": runtime.GOOS/);
assert.throws(() => rewriteConnectorGate("internal/gateway/gateway.go", "different source"));
const google = rewriteConnectorGate("internal/connector/catalog.go", 'Fields: fApp("console.cloud.google.com (a Desktop or Web client)"),\nfunc (a *api) send(ctx context.Context, req *request) ([]byte, error) {');
assert.match(google, /Fields: signIn\(nil, f\("token", "Temporary Google access token \(read only\)"/);
assert.match(google, /req.method != "GET" && req.method != "HEAD"/);
assert.match(google, /req.headers\["Authorization"\] = "Bearer " \+ strings.TrimSpace\(a.s\["token"\]\)/);
assert.throws(() => rewriteConnectorGate("internal/connector/catalog.go", "different source"));
const googleCheck = rewriteConnectorGate("internal/connector/check.go", 'return get("https://gmail.googleapis.com/gmail/v1/users/me/profile", bearer(s["token"]))\n\t}, []string{"emailAddress"}},');
assert.match(googleCheck, /https:\/\/www.googleapis.com\/drive\/v3\/about\?fields=user\(permissionId\)/);
assert.match(googleCheck, /bearer\(strings.TrimSpace\(s\["token"\]\)\)/);
assert.match(googleCheck, /https:\/\/gmail.googleapis.com\/gmail\/v1\/users\/me\/profile", nil/);
assert.throws(() => rewriteConnectorGate("internal/connector/check.go", "different source"));
const root = await mkdtemp(join(tmpdir(), "lexopen-connector-patch-test-"));
try {
  await writeFile(join(root, ".lexopen-source-commit"), PINNED_COMMIT);
  await mkdir(join(root, "internal/chat"), { recursive: true });
  await writeFile(join(root, "internal/chat/limit.go"), "modified");
  await assert.rejects(() => hardenConnectors(root), /Pinned source differs/);
  assert.equal(await readFile(join(root, "internal/chat/limit.go"), "utf8"), "modified");
  await writeFile(join(root, ".lexopen-source-commit"), "wrong");
  await assert.rejects(() => hardenConnectors(root), /exact public source commit/);
} finally { await rm(root, { recursive: true, force: true }); }
console.log("Pinned connector hardening: model cannot change permissions; every connector call requires approval; changed source refused.");
