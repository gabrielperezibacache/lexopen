const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createDataBackup, validateBackupDirectory, restoreDataDirectory } = require("./backup.cjs");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lexopen-integrity-"));
  try {
    const source = path.join(root, "source"), backup = path.join(root, "backup"), target = path.join(root, "target");
    await fs.mkdir(path.join(source, "pgdata"), { recursive: true });
    await fs.mkdir(path.join(source, "storage", "empty"), { recursive: true });
    await fs.writeFile(path.join(source, "pgdata", "PG_VERSION"), "17");
    await fs.writeFile(path.join(source, "storage", "document.txt"), "fictitious original");
    await fs.mkdir(target); await fs.writeFile(path.join(target, "keep"), "prior installation");
    await createDataBackup(source, backup);
    assert.equal((await validateBackupDirectory(backup)).integrityVerified, true);
    for (const change of ["changed", "missing", "added", "directory", "link"]) {
      const copy = path.join(root, change); await fs.cp(backup, copy, { recursive: true });
      if (change === "changed") await fs.writeFile(path.join(copy, "storage", "document.txt"), "fictitious modified");
      if (change === "missing") await fs.rm(path.join(copy, "storage", "document.txt"));
      if (change === "added") await fs.writeFile(path.join(copy, "extra"), "extra");
      if (change === "directory") await fs.rmdir(path.join(copy, "storage", "empty"));
      if (change === "link") await fs.symlink(source, path.join(copy, "outside"), "junction");
      await assert.rejects(restoreDataDirectory(target, copy), /Integridad|enlaces/);
      assert.equal(await fs.readFile(path.join(target, "keep"), "utf8"), "prior installation");
    }
    // Catch silent copy corruption too; retain the previous installation.
    const cp = fs.cp;
    fs.cp = async (...args) => { await cp(...args); await fs.writeFile(path.join(args[1], "storage", "document.txt"), "bad copy"); };
    try { await assert.rejects(restoreDataDirectory(target, backup), /Integridad/); } finally { fs.cp = cp; }
    assert.equal(await fs.readFile(path.join(target, "keep"), "utf8"), "prior installation");
    const manifestPath = path.join(backup, "manifest.json"), manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    delete manifest.integrity; await fs.writeFile(manifestPath, JSON.stringify(manifest));
    assert.equal((await validateBackupDirectory(backup)).integrityVerified, false, "legacy backups remain explicitly unverified");
    console.log("Backup integrity: modification, missing/extra file, directory, link, copy corruption and legacy compatibility passed.");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
