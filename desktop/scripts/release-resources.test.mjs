import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { binaryIdentity, copyResourceTree, copyStagedReleaseResources, nativeTarget, parseTargetArgs, privateResourcePath, resourceFiles, sha256, verifyBinary, verifyDesktopSourceResource, verifyNativeRuntime, verifyReleaseResources, verifyCanaryAbsent } from "./release-resources.mjs";
import { copyTrackedRuntimeResources } from "./prepare-resources.mjs";

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
  const standalone = path.join(root, "next-standalone"), checkoutModules = path.join(root, "public-checkout/node_modules");
  const nextAlias = path.join(standalone, ".next/node_modules/@aws-sdk/client-s3-ecbef8e33fd0b8f0"), publicPackage = path.join(checkoutModules, "@aws-sdk/client-s3");
  fs.mkdirSync(publicPackage, { recursive: true }); fs.writeFileSync(path.join(publicPackage, "index.js"), "public dependency fixture");
  fs.mkdirSync(path.dirname(nextAlias), { recursive: true }); fs.symlinkSync(publicPackage, nextAlias, "junction");
  const nextOptions = { nextNodeModulesRoot: checkoutModules };
  assert.throws(() => copyResourceTree(standalone, path.join(root, "next-unscoped")), /External resource/);
  copyResourceTree(standalone, path.join(root, "next-safe"), nextOptions);
  assert.equal(fs.readFileSync(path.join(root, "next-safe/.next/node_modules/@aws-sdk/client-s3-ecbef8e33fd0b8f0/index.js"), "utf8"), "public dependency fixture");
  assert.equal(fs.lstatSync(path.join(root, "next-safe/.next/node_modules/@aws-sdk/client-s3-ecbef8e33fd0b8f0")).isSymbolicLink(), false);
  const ordinaryAlias = path.join(standalone, "ordinary-alias"); fs.symlinkSync(publicPackage, ordinaryAlias, "junction");
  assert.throws(() => copyResourceTree(standalone, path.join(root, "next-wrong-prefix"), nextOptions), /External resource/); fs.unlinkSync(ordinaryAlias);
  fs.unlinkSync(nextAlias); const outsidePackage = path.join(root, "outside-package"); fs.mkdirSync(outsidePackage); fs.symlinkSync(outsidePackage, nextAlias, "junction");
  assert.throws(() => copyResourceTree(standalone, path.join(root, "next-outside"), nextOptions), /target=outside-checkout-node_modules/); fs.unlinkSync(nextAlias);
  const privatePackage = path.join(checkoutModules, ".env.production"); fs.mkdirSync(privatePackage); fs.symlinkSync(privatePackage, nextAlias, "junction");
  assert.throws(() => copyResourceTree(standalone, path.join(root, "next-private-alias"), nextOptions), /Private resource symlink/); fs.unlinkSync(nextAlias);
  fs.symlinkSync(publicPackage, nextAlias, "junction"); fs.symlinkSync(publicPackage, path.join(publicPackage, "loop"), "junction");
  assert.throws(() => copyResourceTree(standalone, path.join(root, "next-cycle"), nextOptions), /Cyclic resource/); fs.unlinkSync(path.join(publicPackage, "loop"));
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
  const pgRoot = path.join(modules, "@embedded-postgres/darwin-arm64");
  const pgSqlAssets = ["native/share/postgresql/system_views.sql", "native/share/postgresql/extension/amcheck--1.0--1.1.sql"];
  for (const name of pgSqlAssets) write(path.join(pgRoot, name), "-- public PostgreSQL distribution fixture\nSELECT 1;");
  for (const name of ["prisma/build/index.js", "tsx/dist/cli.mjs", "embedded-postgres/dist/index.js"]) write(path.join(modules, name), "fixture");
  assert.equal(verifyNativeRuntime(resources, modules, native).postgresPackage, "darwin-arm64");
  write(path.join(pgRoot, "vault/database.sql"), "PRIVATE_DUMP_CANARY");
  assert.throws(() => verifyNativeRuntime(resources, modules, native), /Private native resource/);
  fs.rmSync(path.join(pgRoot, "vault"), { recursive: true });
  write(path.join(pgRoot, ".env"), "PRIVATE_ENV_CANARY");
  assert.throws(() => verifyNativeRuntime(resources, modules, native), /Private native resource/);
  fs.unlinkSync(path.join(pgRoot, ".env"));
  // Exercise the production tracked-file staging path, not only directory copies.
  const publicRepo = path.join(root, "public-repo"), migration = "prisma/migrations/20261104000000_fixture/migration.sql";
  const publicInputs = {
    [migration]: "CREATE TABLE public_fixture (id INTEGER PRIMARY KEY);",
    "prisma/schema.prisma": "// public schema fixture",
    "prisma/seed.ts": "// public seed fixture",
    "src/lib/db.ts": "// public application fixture",
    "tsconfig.json": "{}",
    "scripts/local-host-schedulers.mjs": "// scheduler fixture",
    "desktop/scripts/host-smoke-runner.mjs": "// smoke fixture",
    "prisma/database.sql": "PRIVATE_DUMP_CANARY",
    "prisma/migrations/20261104000000_fixture/dump.sql": "PRIVATE_DUMP_CANARY",
  };
  for (const [file, content] of Object.entries(publicInputs)) write(path.join(publicRepo, file), content);
  const gitEnv = { ...process.env };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete gitEnv[key];
  for (const args of [["-c", "init.templateDir=", "init", "--quiet"], ["add", "--", ...Object.keys(publicInputs)]]) {
    const result = spawnSync("git", args, { cwd: publicRepo, env: gitEnv, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  copyTrackedRuntimeResources(publicRepo, resources);
  for (const prefix of [resources, path.join(resources, "app-standalone")]) {
    assert.equal(fs.readFileSync(path.join(prefix, migration), "utf8"), publicInputs[migration]);
    assert.equal(fs.existsSync(path.join(prefix, "prisma/database.sql")), false);
    assert.equal(fs.existsSync(path.join(prefix, "prisma/migrations/20261104000000_fixture/dump.sql")), false);
  }
  const app = path.join(resources, "app-standalone");
  for (const [file, content] of Object.entries({ "server.js": "// server fixture", ".next/BUILD_ID": "fixture-build", "package.json": "{}", ".next/static/fixture.js": "// public static fixture" })) write(path.join(app, file), content);
  write(path.join(app, "lexopen-release.json"), JSON.stringify({ version: "1.1.0-preview.1", sourceDirty: false, sourceRevision: "a".repeat(40), buildId: "fixture-build", platform: "darwin", arch: "arm64" }));
  write(path.join(app, "playwright-browsers/chromium-fixture/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"), macho);
  assert.equal(verifyReleaseResources(resources, modules, native).browserExecutables, 1);
  const sourceBundle = path.join(resources, "altazor-desktop-source"), context = path.join(sourceBundle, "context.tar.gz");
  const profile = JSON.parse(fs.readFileSync(new URL("../altazor-desktop-profile.json", import.meta.url), "utf8"));
  const archiveBytes = Buffer.from("fictitious source context fixture");
  write(context, archiveBytes);
  const manifest = { format: 1, profile: profile.id, sourceCommit: profile.sourceCommit, lumenCommit: profile.windowManagerCommit, file: "context.tar.gz", size: archiveBytes.length, sha256: sha256(context) };
  write(path.join(sourceBundle, "manifest.json"), JSON.stringify(manifest));
  assert.equal(verifyReleaseResources(resources, modules, native).altazorDesktopSourceSha256, manifest.sha256);
  write(context, Buffer.alloc(archiveBytes.length));
  assert.throws(() => verifyDesktopSourceResource(sourceBundle), /does not match/);
  write(context, archiveBytes);
  write(path.join(sourceBundle, "third-file.txt"), "unexpected");
  assert.throws(() => verifyDesktopSourceResource(sourceBundle), /source inventory/);
  fs.unlinkSync(path.join(sourceBundle, "third-file.txt"));
  write(path.join(app, "node_modules/next/dist/server/fixture.js"), "// complete Next dependency fixture");
  write(path.join(app, "node_modules/next/dist/fixture/entry.js"), "// directory/file ordering fixture");
  write(path.join(app, "node_modules/next/dist/fixture.js"), "// sibling file ordering fixture");
  const packaged = path.join(root, "packaged-resources");
  write(path.join(packaged, "app-standalone/server.js"), "// incomplete builder output");
  write(path.join(packaged, "app-standalone/node_modules/next/stale.js"), "// stale partial dependency");
  assert.equal(fs.existsSync(path.join(packaged, "app-standalone/node_modules/.prisma/client")), false);
  const copied = copyStagedReleaseResources(resources, packaged, modules, native);
  assert.equal(copied.copiedFiles, resourceFiles(resources).length);
  assert.deepEqual(resourceFiles(packaged), resourceFiles(resources));
  assert.equal(fs.existsSync(path.join(packaged, "app-standalone/node_modules/next/stale.js")), false);
  assert.equal(fs.readFileSync(path.join(packaged, "app-standalone/node_modules/next/dist/server/fixture.js"), "utf8"), "// complete Next dependency fixture");
  assert.equal(verifyReleaseResources(packaged, modules, native).browserExecutables, 1);
  write(path.join(app, ".env"), "PRIVATE_ENV_CANARY");
  write(path.join(packaged, "app-standalone/server.js"), "// keep destination on rejected staging");
  assert.throws(() => copyStagedReleaseResources(resources, packaged, modules, native), /Private resource/);
  assert.equal(fs.readFileSync(path.join(packaged, "app-standalone/server.js"), "utf8"), "// keep destination on rejected staging");
  fs.unlinkSync(path.join(app, ".env"));
  write(path.join(resources, pgSqlAssets[0]), "PRIVATE_DUMP_CANARY");
  assert.throws(() => verifyReleaseResources(resources, modules, native), /Private native resource/);
  fs.rmSync(path.join(resources, "native"), { recursive: true });
  verifyCanaryAbsent(resources, "PRIVATE_DUMP_CANARY");
  write(query, elf); assert.throws(() => verifyNativeRuntime(resources, modules, native), /does not match/); write(query, macho);
  fs.unlinkSync(path.join(modules, "@embedded-postgres/darwin-arm64/bin/initdb")); assert.throws(() => verifyNativeRuntime(resources, modules, native), /Missing PostgreSQL executable/);
  if (process.platform !== "win32") {
    const framework = path.join(root, "browser-framework/Google Chrome for Testing Framework.framework"), frameworkCopy = path.join(root, "framework-copy");
    const frameworkBinary = "Google Chrome for Testing Framework";
    write(path.join(framework, "Versions/A", frameworkBinary), macho);
    fs.chmodSync(path.join(framework, "Versions/A", frameworkBinary), 0o755);
    write(path.join(framework, "Versions/A/Resources/Info.plist"), "public framework fixture");
    fs.symlinkSync("A", path.join(framework, "Versions/Current"));
    fs.symlinkSync(`Versions/Current/${frameworkBinary}`, path.join(framework, frameworkBinary));
    fs.symlinkSync("Versions/Current/Resources", path.join(framework, "Resources"));
    copyResourceTree(framework, frameworkCopy);
    for (const file of [frameworkBinary, `Versions/Current/${frameworkBinary}`]) {
      assert.equal(fs.lstatSync(path.join(frameworkCopy, file)).isSymbolicLink(), false);
      verifyBinary(path.join(frameworkCopy, file), native);
      assert.equal(fs.statSync(path.join(frameworkCopy, file)).mode & 0o777, 0o755);
    }
    assert.equal(fs.readFileSync(path.join(frameworkCopy, "Resources/Info.plist"), "utf8"), "public framework fixture");
    assert.doesNotThrow(() => resourceFiles(frameworkCopy));
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
assert.equal(metadata.source, "docs/assets/lexopen-lockup.png");
assert.equal(metadata.sourceSha256, sha256(path.join(repo, metadata.source)));
assert.equal(metadata.reader, "docs/assets/lexopen-engraving.png");
assert.equal(metadata.readerSha256, sha256(path.join(repo, metadata.reader)));
assert.equal(sha256(path.join(repo, "src/app/favicon.ico")), sha256(path.join(repo, "desktop/build/icon.ico")));
const png = fs.readFileSync(path.join(repo, "desktop/build/icon.png")); assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1024);
const ico = fs.readFileSync(path.join(repo, "desktop/build/icon.ico")); assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 6);
const icns = fs.readFileSync(path.join(repo, "desktop/build/icon.icns")); assert.equal(icns.toString("ascii", 0, 4), "icns"); assert.equal(icns.readUInt32BE(4), icns.length);
console.log("Desktop release resources: complete afterPack copy, scoped Next aliases, tracked migrations, private dump exclusion, macOS Chromium/frameworks, native architecture, target guards and existing-brand icons passed.");
