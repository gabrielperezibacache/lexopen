import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseTargetArgs } from "./release-resources.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const target = parseTargetArgs(process.argv.slice(2));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// Windows .cmd wrappers require cmd.exe. All arguments below are fixed, never user input.
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env: process.env, stdio: "inherit", shell: process.platform === "win32" && command === npm, ...options });
  if (result.error || result.status !== 0) throw new Error(`Build step failed: ${path.basename(command)} (${result.status ?? result.error?.code})`);
}
const state = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: root, encoding: "utf8" });
if (state.status !== 0 || state.stdout.trim()) throw new Error("Build installers from a clean checkout of the public repository");
for (const name of fs.readdirSync(root)) {
  if (/^\.env(?:\.|$)/.test(name) && !/^\.env\.(?:example|sample)$/.test(name)) throw new Error("Installer builds require an environment-file-free checkout");
}
run(process.execPath, ["desktop/node_modules/electron/install.js"]);
run(npm, ["run", "desktop:build"]);
run(process.execPath, ["desktop/scripts/prepare-resources.mjs", "--platform", target.platform, "--arch", target.arch]);
const version = JSON.parse(fs.readFileSync(path.join(root, "desktop/package.json"), "utf8")).version;
const channel = version.includes("-") ? "preview" : "latest";
run(process.execPath, [path.join(root, "desktop/node_modules/electron-builder/out/cli/cli.js"), `--${target.platform === "darwin" ? "mac" : target.platform === "win32" ? "win" : "linux"}`, `--${target.arch}`, "--publish", "never", `-c.publish.channel=${channel}`, "-c.generateUpdatesFilesForAllChannels=false"], { cwd: path.join(root, "desktop") });
