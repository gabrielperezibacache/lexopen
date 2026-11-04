import assert from "node:assert/strict";
import { gatewayStartupCategory, gatewayStartupSummary } from "./computer-smoke-diagnostics";

const secret = "fictitious-private-token-never-print", endpoint = "https://private-fixture.invalid/path";
const updateError = `kitties: updates.gateway: "false" is not off, notify or auto\n${secret} ${endpoint}`;
assert.equal(gatewayStartupCategory(updateError), "configuration_update_mode");
assert.equal(gatewayStartupSummary({ exitCode: 1, signalCode: null, logTail: updateError }), "exit=1, signal=none, category=configuration_update_mode");
assert.equal(gatewayStartupCategory("sudo: cannot execute pinned binary: Permission denied"), "filesystem_permission");
assert.equal(gatewayStartupCategory("listen tcp: bind: address already in use"), "listener_address");
assert.equal(gatewayStartupCategory("Cannot connect to the Docker daemon"), "docker_unavailable");
assert.equal(gatewayStartupCategory('unknown key "unexpected" in gateway'), "configuration_schema");
assert.equal(gatewayStartupCategory("no such file or directory"), "executable_or_path");
assert.equal(gatewayStartupCategory(secret, true), "spawn_failed");
assert.equal(gatewayStartupSummary({ exitCode: null, signalCode: "SIGTERM", logTail: secret }), "exit=pending, signal=SIGTERM, category=unknown_startup");
const safe = gatewayStartupSummary({ exitCode: -1, signalCode: secret, logTail: `${secret} ${endpoint}\n${"x".repeat(40 * 1024)}` });
assert.equal(safe, "exit=pending, signal=none, category=unknown_startup");
assert.ok(!safe.includes(secret) && !safe.includes(endpoint));
console.log("Computer smoke diagnostics PASS: bounded fixed categories and process status without private log reflection.");
