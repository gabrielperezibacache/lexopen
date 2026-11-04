import assert from "node:assert/strict";
import { requireProbeEnvironment, classifyPgDiagnostic, redactPgDiagnostic, directPgSettings } from "./native-pg-probe.mjs";

assert.doesNotThrow(() => requireProbeEnvironment({ CI: "true", GITHUB_ACTIONS: "true" }, "win32", "x64"));
for (const args of [[{}, "win32", "x64"], [{ CI: "true", GITHUB_ACTIONS: "true" }, "darwin", "arm64"], [{ CI: "true", GITHUB_ACTIONS: "true" }, "win32", "arm64"]]) assert.throws(() => requireProbeEnvironment(...args), /requires Windows/);
assert.equal(classifyPgDiagnostic("", -1073741502), "WINDOWS_DLL_INITIALIZATION_FAILED");
assert.equal(classifyPgDiagnostic("", 3221225781), "WINDOWS_DLL_NOT_FOUND");
assert.equal(classifyPgDiagnostic('invalid locale name "en_US.UTF-8"', 1), "LOCALE_UNSUPPORTED");
assert.equal(classifyPgDiagnostic("database system is ready to accept connections", null), "READY");
const root = "C:\\owned temp\\datos & revisión", password = "abc123-fictitious-password";
const redacted = redactPgDiagnostic(`path=${root} file=${root.replaceAll("\\", "/")}/pgdata password=${password} uri=postgresql://fake:${password}@127.0.0.1 token=fixture-token`, { password, roots: [root] });
assert(!redacted.includes(password)); assert(!redacted.includes("fixture-token")); assert(!redacted.includes(root)); assert(!redacted.includes("datos & revisión"));
assert(redacted.includes("<probe-path>")); assert(redacted.includes("postgresql://<redacted>@"));
const inherited = { SystemRoot: "C:\\Windows", PATH: "C:\\Windows\\System32" };
assert.deepEqual(directPgSettings("direct-vendor", inherited).env, { LC_MESSAGES: "en_US.UTF-8" });
assert.equal(directPgSettings("direct-inherited", inherited).env.SystemRoot, inherited.SystemRoot);
assert.deepEqual(directPgSettings("direct-c", inherited).initFlags, ["--locale=C", "--lc-messages=C", "--encoding=UTF8"]);
assert.throws(() => directPgSettings("product", inherited));
console.log("Native PostgreSQL CI probe guards, Windows status classification, fictitious-log redaction and comparison variants passed; no database or binary executed.");
