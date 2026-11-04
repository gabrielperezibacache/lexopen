import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { binaryIdentity, copyResourceTree, nativeTarget, parseTargetArgs, privateResourcePath, resourceFiles, sha256, verifyBinary, verifyNativeRuntime, verifyCanaryAbsent } from "./release-resources.mjs";

for (const name of [".env", "host.env", "credentials.json", "database.sql", "pg-password-fixture", ".postgres-init-fixture/password", "node_modules/a/.env.production", ".tmp/session/case.txt", "storage/book.pdf", "pgdata/base/123", "secrets/key.txt", "a/client.p12", "node_modules/cache.sqlite", "x/private/data.json", ".next/cache/results.json"]) assert.equal(privateResourcePath(name), true, name);
for (const name of ["src/lib/db.ts", "src/lib/pjud/private-response.ts", "prisma/migrations/1/migration.sql", "node_modules/.prisma/client/schema.prisma", "node_modules/@next/env/dist/index.js"]) assert.equal(privateResourcePath(name), false, name);
for (const [platform, arch] of [["darwin", "x64"], ["darwin", "arm64"], ["win32", "x64"], ["linux", "x64"]]) assert.equal(nativeTarget(platform, arch, { platform, arch }).target, `${platform}-${arch}`);
assert.throws(() => nativeTarget("win32", "x64", { platform: "darwin", arch: "arm64" }), /Native release/);
assert.throws(() => nativeTarget("linux", "arm64", { platform: "linux", arch: "arm64" }), /Unsupported/);
assert.throws(() => parseTargetArgs(["--anything", "value"]));

const macho = Buffer.alloc(32); macho.writeUInt32LE(0xfeedfacf); macho.writeUInt32LE(0x0100000c, 4);
const elf = Buffer.alloc(64); elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]); elf.writeUInt16LE(62, 18);
const pe = Buffer.alloc(256); pe.writeUInt16LE(0x5a4d); pe.writeUInt32LE(128, 0x3c); pe.writeUInt32LE(0x4550, 128); pe.writeUInt16LE(0x8664, 132);
assert.deepEqual(binaryIdentity(macho), { platform: "darwin", architectures: ["arm64"] });
assert.deepEqual(binaryIdentity(elf), { platform: "linux", architectures: ["x64"] });
assert.deepEqual(binaryIdentity(pe), { platform: "win32", architectures: ["x64"] });
assert.throws(() => binaryIdentity(Buffer.alloc(16)), /Truncated/);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-release-test-"));
try {
  const source = path.join(root, "source"), destination = path.join(root, "destination"); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "server.js"), "public source");
  fs.writeFileSync(path.join(source, ".env"), "PRIVATE_CANARY"); fs.mkdirSync(path.join(source, "storage")); fs.writeFileSync(path.join(source, "storage", "book.txt"), "PRIVATE_CANARY");
  const stripped = []; copyResourceTree(source, destination, { stripped });
  assert.deepEqual(resourceFiles(destination), ["server.js"]); assert.equal(stripped.length, 2);
  assert(!fs.readFileSync(path.join(destination, "server.js"), "utf8").includes("PRIVATE_CANARY"));
  verifyCanaryAbsent(destination, "PRIVATE_CANARY_VALUE");
  fs.writeFileSync(path.join(destination, "canary.js"), Buffer.concat([Buffer.alloc(65_530), Buffer.from("PRIVATE_CANARY_VALUE")])); assert.throws(() => verifyCanaryAbsent(destination, "PRIVATE_CANARY_VALUE"), /canary/); fs.unlinkSync(path.join(destination, "canary.js"));
  fs.writeFileSync(path.join(source, "binary"), macho); fs.chmodSync(path.join(source, "binary"), 0o755);
  verifyBinary(path.join(source, "binary"), { platform: "darwin", arch: "arm64", target: "darwin-arm64" });
  assert.throws(() => verifyBinary(path.join(source, "binary"), { platform: "darwin", arch: "x64", target: "darwin-x64" }), /does not match/);
  copyResourceTree(path.join(source, ".env"), path.join(root, "direct-secret")); assert.equal(fs.existsSync(path.join(root, "direct-secret")), false);
  const resources = path.join(root, "resources"), modules = path.join(root, "modules"), query = path.join(resources, "app-standalone/node_modules/.prisma/client/libquery_engine-darwin-arm64.dylib.node");
  const native = { platform: "darwin", arch: "arm64", target: "darwin-arm64" };
  const write = (file, content) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };
  write(query, macho); write(path.join(modules, "@prisma/engines/schema-engine-darwin-arm64"), macho);
  for (const name of ["postgres", "initdb", "pg_ctl"]) write(path.join(modules, "@embedded-postgres/darwin-arm64/bin", name), macho);
  for (const name of ["prisma/build/index.js", "tsx/dist/cli.mjs", "embedded-postgres/dist/index.js"]) write(path.join(modules, name), "fixture");
  assert.equal(verifyNativeRuntime(resources, modules, native).postgresPackage, "darwin-arm64");
  write(query, elf); assert.throws(() => verifyNativeRuntime(resources, modules, native), /does not match/); write(query, macho);
  fs.unlinkSync(path.join(modules, "@embedded-postgres/darwin-arm64/bin/initdb")); assert.throws(() => verifyNativeRuntime(resources, modules, native), /Missing PostgreSQL executable/);
  if (process.platform !== "win32") {
    fs.symlinkSync(".env", path.join(source, "secret-alias")); assert.throws(() => copyResourceTree(source, path.join(root, "secret-copy")), /Private/); fs.unlinkSync(path.join(source, "secret-alias"));
    fs.symlinkSync(source, path.join(root, "root-link")); assert.throws(() => copyResourceTree(path.join(root, "root-link"), path.join(root, "root-copy")), /input roots/);
    fs.symlinkSync("server.js", path.join(source, "internal")); copyResourceTree(source, path.join(root, "safe")); assert.equal(fs.lstatSync(path.join(root, "safe", "internal")).isSymbolicLink(), false);
    fs.symlinkSync(path.join(root, "outside"), path.join(source, "missing")); assert.throws(() => copyResourceTree(source, path.join(root, "missing-copy")));
    fs.unlinkSync(path.join(source, "missing")); fs.writeFileSync(path.join(root, "outside"), "PRIVATE_CANARY"); fs.symlinkSync(path.join(root, "outside"), path.join(source, "external")); assert.throws(() => copyResourceTree(source, path.join(root, "unsafe")), /External/);
    fs.unlinkSync(path.join(source, "external")); fs.symlinkSync(".", path.join(source, "cycle")); assert.throws(() => copyResourceTree(source, path.join(root, "cycle-copy")), /Cyclic/);
  }
} finally { fs.rmSync(root, { recursive: true }); }
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const metadata = JSON.parse(fs.readFileSync(path.join(repo, "desktop/build/icons-source.json"), "utf8"));
assert.equal(metadata.sourceSha256, sha256(path.join(repo, "src/app/icon.svg")));
const png = fs.readFileSync(path.join(repo, "desktop/build/icon.png")); assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1024);
const ico = fs.readFileSync(path.join(repo, "desktop/build/icon.ico")); assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 6);
const icns = fs.readFileSync(path.join(repo, "desktop/build/icon.icns")); assert.equal(icns.toString("ascii", 0, 4), "icns"); assert.equal(icns.readUInt32BE(4), icns.length);
console.log("Desktop release resources: private canaries, safe links, native architecture, target guards and existing-brand icons passed.");
