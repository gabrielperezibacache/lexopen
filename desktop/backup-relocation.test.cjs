const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { promisify } = require("node:util");
const { createDataBackup, restoreDataDirectory, finalizeRestore } = require("./backup.cjs");
const { activeDataDir, parseEnvFile, readConfig } = require("./config.cjs");

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lexopen-backup-relocate-test-"));
  const source = path.join(root, "first host"), backup = path.join(root, "backup"), target = path.join(root, "new host");
  try {
    await fs.mkdir(path.join(source, "pgdata"), { recursive: true });
    await fs.mkdir(path.join(source, "storage"));
    await fs.mkdir(path.join(source, "obsidian-vault"));
    await fs.writeFile(path.join(source, "pgdata", "PG_VERSION"), "16\n");
    await fs.writeFile(path.join(source, "storage", "fixture.txt"), "Fictitious bytes");
    await fs.writeFile(path.join(source, "obsidian-vault", "case.md"), "Fictitious case note");
    const preferences = { hostDataDir: source, mode: "host", updateChannel: "preview" };
    await fs.writeFile(path.join(source, "desktop-config.json"), JSON.stringify(preferences));
    const env = [
      "LEXOPEN_DESKTOP=1", `LEXOPEN_DATA_DIR=${source}`, `STORAGE_PATH=${path.join(source, "storage")}`,
      `OBSIDIAN_VAULT_PATH=${path.join(source, "obsidian-vault")}`,
      `CODEX_DATA_DIR=${path.join(source, "codex")}`,
      "DATABASE_URL=postgresql://lexopen:fictitious@127.0.0.1:54329/lexopen", "SESSION_SECRET=fictitious-preserved-secret", "",
    ].join("\n");
    await fs.writeFile(path.join(source, ".env"), env);
    await createDataBackup(source, backup);

    const result = await restoreDataDirectory(target, backup);
    assert.equal(result.integrityVerified, true);
    assert.equal(result.relocated, true);
    const restored = parseEnvFile(await fs.readFile(path.join(target, ".env"), "utf8")).map;
    assert.equal(restored.LEXOPEN_DATA_DIR, target);
    assert.equal(restored.STORAGE_PATH, path.join(target, "storage"));
    assert.equal(restored.OBSIDIAN_VAULT_PATH, path.join(target, "obsidian-vault"));
    assert.equal(restored.CODEX_DATA_DIR, path.join(target, "codex"));
    assert.equal(restored.SESSION_SECRET, "fictitious-preserved-secret");
    assert.equal(activeDataDir(readConfig(target)), target);
    assert.equal(readConfig(target).updateChannel, "preview");
    assert.equal(await fs.readFile(path.join(source, ".env"), "utf8"), env);
    assert.equal(await fs.readFile(path.join(backup, ".env"), "utf8"), env);
    await finalizeRestore(result.rollback);

    const offlineSource = path.join(root, "disconnected source"), cliTarget = path.join(root, "second machine");
    await fs.rename(source, offlineSource);
    const cli = await promisify(execFile)(process.execPath, [path.join(__dirname, "../scripts/web-restore.mjs"), "--source", backup], {
      env: { ...process.env, LEXOPEN_DATA_DIR: cliTarget },
    });
    assert.match(cli.stdout, /Inventario de archivos verificado/);
    assert.match(cli.stdout, /rutas de almacenamiento del Host apuntan a la carpeta restaurada/);
    const cliEnv = parseEnvFile(await fs.readFile(path.join(cliTarget, ".env"), "utf8")).map;
    assert.equal(await fs.readFile(path.join(cliEnv.STORAGE_PATH, "fixture.txt"), "utf8"), "Fictitious bytes");
    assert.equal(await fs.readFile(path.join(cliEnv.OBSIDIAN_VAULT_PATH, "case.md"), "utf8"), "Fictitious case note");
    assert.equal(activeDataDir(readConfig(cliTarget)), cliTarget);
    await fs.rename(offlineSource, source);
    const inPlace = await restoreDataDirectory(source, backup);
    assert.equal(inPlace.relocated, false);
    assert.equal(await fs.readFile(path.join(source, ".env"), "utf8"), env);
    await finalizeRestore(inPlace.rollback);

    const bad = path.join(root, "bad");
    await fs.cp(backup, bad, { recursive: true });
    const legacy = JSON.parse(await fs.readFile(path.join(bad, "manifest.json"), "utf8"));
    delete legacy.integrity;
    legacy.formatVersion = 1;
    await fs.writeFile(path.join(bad, "manifest.json"), JSON.stringify(legacy));
    await fs.writeFile(path.join(bad, ".env"), env.replace(path.join(source, "storage"), path.join(root, "outside")));
    await assert.rejects(restoreDataDirectory(target, bad), /rutas externas/);
    await fs.writeFile(path.join(bad, ".env"), env + "S3_BUCKET=external-fixture\n");
    await assert.rejects(restoreDataDirectory(target, bad), /S3 externo/);
    await fs.writeFile(path.join(bad, ".env"), env);
    await fs.writeFile(path.join(bad, "desktop-config.json"), JSON.stringify({ hostDataDir: path.join(root, "outside") }));
    await assert.rejects(restoreDataDirectory(target, bad), /otra instalación/);
    assert.equal(await fs.readFile(path.join(target, "storage", "fixture.txt"), "utf8"), "Fictitious bytes");

    const cp = fs.cp;
    fs.cp = async (_source, destination) => {
      await fs.mkdir(destination, { recursive: true });
      await fs.writeFile(path.join(destination, "partial"), "partial");
      throw Error("Fictitious partial-copy failure");
    };
    try { await assert.rejects(restoreDataDirectory(target, backup), /partial-copy/); } finally { fs.cp = cp; }
    assert.equal(await fs.readFile(path.join(target, "storage", "fixture.txt"), "utf8"), "Fictitious bytes");
    assert.equal(await fs.readFile(path.join(source, ".env"), "utf8"), env);
    console.log("Managed backup restoration passed for the original host and an independent CLI destination with the source offline, including rollback and external-storage checks.");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
