const { execFile } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const { promisify } = require("node:util");
const profile = require("./altazor-desktop-profile.json");

const runFile = promisify(execFile);
const safeEnvironmentKeys = ["PATH", "Path", "SystemRoot", "WINDIR", "TMPDIR", "TMP", "TEMP", "LANG"];

function desktopCliEnvironment(env = process.env) {
  return Object.fromEntries(safeEnvironmentKeys.filter(key => env[key]).map(key => [key, env[key]]));
}

function localEngineCandidates(platform, userDirectory, userId) {
  if (platform === "win32") {
    return ["npipe:////./pipe/dockerDesktopLinuxEngine", "npipe:////./pipe/docker_engine"];
  }
  const hosts = ["unix:///var/run/docker.sock"];
  if (platform === "darwin") hosts.unshift(`unix://${path.join(userDirectory, ".docker/run/docker.sock")}`);
  if (platform === "linux" && Number.isInteger(userId) && userId > 0) {
    hosts.unshift(`unix:///run/user/${userId}/docker.sock`);
  }
  return hosts;
}

function dockerDesktopRoot(platform = process.platform, env = process.env) {
  if (platform === "darwin") return "/Applications/Docker.app/Contents/Resources";
  if (platform === "win32") return path.win32.join(env.ProgramFiles || "C:\\Program Files", "Docker", "Docker", "resources");
  return null;
}

async function localDesktopEngine({ env = process.env, execute = runFile, platform = process.platform, userDirectory = os.homedir(), userId = process.getuid?.() } = {}) {
  const options = { env: desktopCliEnvironment(env), timeout: 2500, maxBuffer: 16 * 1024, windowsHide: true, shell: false };
  const binaries = ["docker"];
  const desktop = dockerDesktopRoot(platform, env);
  if (desktop) {
    const join = platform === "win32" ? path.win32.join : path.join;
    binaries.push(join(desktop, "bin", platform === "win32" ? "docker.exe" : "docker"));
  }
  let state = "engine-missing";
  for (const binary of binaries) {
    for (const host of localEngineCandidates(platform, userDirectory, userId)) {
      try {
        const result = await execute(binary, ["--host", host, "version", "--format", "{{.Server.Os}}"], options);
        if (result.stdout.trim() === "linux") return { state: "engine-ready", host, binary };
        state = "linux-engine-required";
      } catch (error) {
        if (error.code === "ENOENT") break;
        if (state === "engine-missing") state = "engine-unavailable";
      }
    }
  }
  return { state };
}

async function diagnoseDesktopProfile(options = {}) {
  const engine = await localDesktopEngine(options);
  if (engine.state !== "engine-ready") return { state: engine.state };
  return { state: await desktopProfilePresent(engine, options) ? "profile-detected" : "profile-pending" };
}

async function desktopProfilePresent(engine, { execute = runFile, env = process.env, architecture } = {}) {
  try {
    const format = '{{.Id}} {{index .Config.Labels "org.lexopen.altazor.desktop-profile"}} {{index .Config.Labels "org.lexopen.altazor.desktop-source"}} {{.Architecture}}';
    const result = await execute(engine.binary, ["--host", engine.host, "image", "inspect", "--format", format, profile.tag], {
      env: desktopCliEnvironment(env), timeout: 2500, maxBuffer: 16 * 1024, windowsHide: true, shell: false,
    });
    const [id, label, source, arch] = result.stdout.trim().split(/\s+/);
    return /^sha256:[a-f0-9]{64}$/.test(id) && label === profile.id && source === profile.sourceCommit &&
      (!architecture || arch === architecture);
  } catch { return false; }
}

module.exports = { desktopCliEnvironment, dockerDesktopRoot, localDesktopEngine, diagnoseDesktopProfile, desktopProfilePresent };
