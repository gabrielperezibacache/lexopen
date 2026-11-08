/** Opt-in CI only: real pinned Kitties/Docker desktop, synthetic local model, disposable PG. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, realpath, readdir, rm, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { KITTIES_SOURCE_COMMIT } from "@/lib/altazor/computer/policy";
import { cancelComputerTask, closeComputerSession, computerScreenshot, computerStatus, configureComputer, controlComputer, createComputerSession, inputComputer, readComputerSession, sendComputerMessage, prepareComputerSecret, typeComputerSecret } from "@/lib/altazor/computer/service";
import { createSecret, deleteSecret } from "@/lib/altazor/secrets/service";
import { gatewayRequestCategory, gatewayStartupSummary, runtimeFailureSummary } from "./computer-smoke-diagnostics";
import { desktopToolchainVerified } from "./desktop-toolchain.mjs";
import desktopProfile from "../../desktop/altazor-desktop-profile.json";

const gatewayUser = "lexopen-kitties-ci", provider = "fixture", responseText = "Respuesta sintética del proveedor local de CI.";
let stage = "guard";
let lastGatewayHttpStatus: number | null = null, lastGatewayOperation = "none";
class SmokeError extends Error {}
function check(value: unknown, message: string): asserts value { if (!value) throw new SmokeError(message); }
function run(bin: string, args: string[], timeout = 30_000): Promise<string> {
  return new Promise((accept, reject) => execFile(bin, args, { timeout, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C.UTF-8", NODE_ENV: "test" } }, (error, stdout) => error ? reject(new SmokeError(`Fixture command failed: ${bin}`)) : accept(stdout.trim())));
}
async function listen(server: Server) {
  await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  const address = server.address(); check(address && typeof address !== "string", "Expected local fixture listener"); return address.port;
}
async function unusedPort() { const server = createServer(); const port = await listen(server); await new Promise<void>(accept => server.close(() => accept())); return port; }
async function privateStartupTail(file: string) {
  const handle = await open(file, "r");
  try { const stat = await handle.stat(), size = Math.min(stat.size, 32 * 1024), bytes = Buffer.alloc(size); const result = await handle.read(bytes, 0, size, Math.max(0, stat.size - size)); return bytes.subarray(0, result.bytesRead).toString("utf8"); }
  finally { await handle.close(); }
}
async function until<T>(read: () => Promise<T>, ready: (result: T) => boolean, timeout = 90_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await read(); if (ready(result)) return result; await new Promise(accept => setTimeout(accept, 1500)); }
  throw new SmokeError("Timed out waiting for real runtime state");
}
async function containsFile(directory: string, bytes: Buffer): Promise<boolean> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    check(!entry.isSymbolicLink(), "Unexpected symlink in fictitious upload copy");
    const path = join(directory, entry.name);
    if (entry.isDirectory() && await containsFile(path, bytes)) return true;
    if (entry.isFile()) { const stat = await lstat(path); check(stat.size <= 1024 * 1024, "Unexpected large fixture upload"); if ((await readFile(path)).equals(bytes)) return true; }
  }
  return false;
}
async function main() {
  check(process.platform === "linux" && process.env.CI === "true" && process.env.LEXOPEN_ALTAZOR_TEST_DOCKER === "1", "This smoke test requires explicit disposable Linux CI opt-in");
  const database = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  check(database === new URL(process.env.DATABASE_URL!).toString(), "Fixture database URLs must match");
  check(process.env.ALTAZOR_COMPUTER_ENABLED === "1" && (process.env.SESSION_SECRET?.length || 0) >= 32, "Fixture feature flag/encryption secret missing");
  const runnerTemp = await realpath(process.env.RUNNER_TEMP!), source = await realpath(process.env.KITTIES_CI_SOURCE!), binary = await realpath(join(source, "dist/kitties"));
  check(source.startsWith(runnerTemp + sep) && binary.startsWith(source + sep), "Upstream source/binary must be in the owned CI temporary directory");
  check((await readFile(join(source, ".lexopen-source-commit"), "utf8")).trim() === KITTIES_SOURCE_COMMIT, "Upstream source pin mismatch");
  check(!(await lstat(join(source, ".git")).catch(() => null)), "Build source must not contain Git credentials or metadata");
  const imageId = process.env.KITTIES_CI_IMAGE_ID || ""; check(/^sha256:[a-f0-9]{64}$/.test(imageId), "A verified local immutable image ID is required");
  check(await run("docker", ["image", "inspect", "--format", "{{.Id}}", imageId]) === imageId, "The image ID must exist before gateway startup");
  const sourceRevision = process.env.GITHUB_SHA || "";
  const architecture = process.env.ALTAZOR_TOOLPACK_ARCH || "";
  check(/^[a-f0-9]{40}$/.test(sourceRevision) && ["amd64", "arm64"].includes(architecture), "Release revision and supported native architecture required");
  check(await run("docker", ["image", "inspect", "--format", "{{.Os}}/{{.Architecture}}", imageId]) === `linux/${architecture}`, "The image must match the native runner architecture");
  const uid = await run("id", ["-u", gatewayUser]); check(/^\d+$/.test(uid) && uid !== "0", "A dedicated unprivileged gateway UID is required");
  await run("sudo", ["-n", "iptables", "-C", "OUTPUT", "-m", "owner", "--uid-owner", uid, "!", "-d", "127.0.0.0/8", "-j", "REJECT"]);
  await run("sudo", ["-n", "ip6tables", "-C", "OUTPUT", "-m", "owner", "--uid-owner", uid, "-j", "REJECT"]);
  check(await prisma.user.count() === 0 && await prisma.firmSettings.count() === 0, "Runtime smoke requires its own empty disposable database");
  const root = await mkdtemp(join(runnerTemp, "lexopen-computer-smoke-")), gatewayRoot = join(root, "gateway"), network = `altazor-ci-${randomUUID().slice(0, 12)}`;
  await chmod(root, 0o755); await mkdir(gatewayRoot, { mode: 0o700 }); await writeFile(join(root, ".owned-computer-smoke"), "fictitious-ci-only\n", { mode: 0o600 });
  const token = `fixture-${randomUUID()}`, modelToken = `fixture-model-${randomUUID()}`, userIds: string[] = [], causeIds: string[] = [];
  let gateway: ChildProcess | undefined, networkCreated = false, containerId = "", sessionId = "", organizationId = "", workspaceId = "", traffic = 0, providerCalls = 0;
  let lastProviderPayload = "", fixtureError = "", modelMode: "reply" | "hang-task" = "reply", pendingModelRequests = 0;
  const sockets = new Set<import("node:net").Socket>();
  const model = createServer(async (request, response) => {
    try {
      check(request.method === "POST" && request.url === "/v1/chat/completions", "Unexpected local provider endpoint");
      check(request.headers.authorization === `Bearer ${modelToken}`, "Incorrect fictitious model credential");
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request) { const bytes = Buffer.from(chunk); size += bytes.length; check(size < 3 * 1024 * 1024, "Provider fixture request too large"); chunks.push(bytes); }
      const payload = Buffer.concat(chunks).toString("utf8"); JSON.parse(payload); providerCalls++; lastProviderPayload = payload;
      if (modelMode === "hang-task") { pendingModelRequests++; response.once("close", () => { pendingModelRequests--; }); return; }
      const content = responseText;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: "fictitious-ci", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } }));
    } catch { fixtureError = "Local model fixture contract failed"; response.writeHead(400); response.end("{}"); }
  });
  model.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  const originalFetch = globalThis.fetch;
  try {
    stage = "gateway-start";
    const modelPort = await listen(model), gatewayPort = await unusedPort(), endpoint = `http://127.0.0.1:${gatewayPort}`;
    await run("docker", ["network", "create", "--internal", "--label", `lexopen.computer-smoke=${network}`, network]); networkCreated = true;
    check(JSON.parse(await run("docker", ["network", "inspect", network]))[0].Internal === true, "Desktop network must prohibit external routing");
    const config = join(gatewayRoot, "kitties.yaml"), work = join(gatewayRoot, "work");
    // The pinned YAML reader treats unquoted off as boolean false; this mode is a string.
    await writeFile(config, [
      `data_dir: ${JSON.stringify(join(gatewayRoot, "data"))}`, "providers:", "  fixture:", "    kind: openai", "    model: fictitious-ci-model", `    base_url: http://127.0.0.1:${modelPort}/v1`, `    api_key: ${modelToken}`, "    tools: text", "    max_attempts: 1", "    prompt_cache: false", "default_provider: fixture", "kitties: []", "connectors: {}", "containers:", "  runtime: docker", `  image: ${imageId}`, `  network: ${network}`, `  workspace: ${JSON.stringify(work)}`, "  memory_mb: 2048", "  cpus: 2", "  auto_update: false", "  auto_off_minutes: 1", "updates:", '  gateway: "off"', "gateway:", `  listen: 127.0.0.1:${gatewayPort}`, `  token: ${token}`, "  local_token: false", "motita:", '  url: ""', "",
    ].join("\n"), { mode: 0o600 });
    await mkdir(join(gatewayRoot, "home"), { mode: 0o700 }); await mkdir(join(gatewayRoot, "tmp"), { mode: 0o700 });
    await run("sudo", ["-n", "chown", "-R", `${gatewayUser}:docker`, gatewayRoot]);
    for (const [flag, target, category] of [["-x", binary, "binary_executable"], ["-x", source, "source_traversable"], ["-r", config, "configuration_readable"]]) {
      await run("sudo", ["-n", "-u", gatewayUser, "env", "-i", "PATH=/usr/local/bin:/usr/bin:/bin", "/usr/bin/test", flag, target]).catch(() => { throw new SmokeError(`Gateway UID permission preflight failed (${category})`); });
    }
    const privateLogPath = join(root, "gateway.private.log"), log = createWriteStream(privateLogPath, { mode: 0o600 });
    gateway = spawn("sudo", ["-n", "-u", gatewayUser, "env", "-i", "PATH=/usr/local/bin:/usr/bin:/bin", `HOME=${join(gatewayRoot, "home")}`, `TMPDIR=${join(gatewayRoot, "tmp")}`, "LANG=C.UTF-8", "TZ=UTC", binary, "-config", config, "gateway"], { cwd: source, env: { PATH: process.env.PATH, LANG: "C.UTF-8", NODE_ENV: "test" }, stdio: ["ignore", "pipe", "pipe"] });
    gateway.stdout!.pipe(log); gateway.stderr!.pipe(log); gateway.once("error", () => { fixtureError = "Gateway process failed to start"; });
    try {
      await until(async () => { check(!fixtureError && gateway?.exitCode === null && gateway?.signalCode === null, "Gateway exited before readiness"); try { return await originalFetch(`${endpoint}/v1/health`, { signal: AbortSignal.timeout(1500) }).then(response => response.json()); } catch { return null; } }, result => result?.ok === true && result.containers === true);
    } catch {
      const logTail = await privateStartupTail(privateLogPath).catch(() => "");
      throw new SmokeError(`Gateway failed readiness (${gatewayStartupSummary({ exitCode: gateway?.exitCode, signalCode: gateway?.signalCode, logTail, spawnFailed: Boolean(fixtureError) })})`);
    }
    globalThis.fetch = (async (raw, init) => {
      const target = new URL(String(raw)); check(target.origin === endpoint, "Broker attempted a destination outside its exact dedicated gateway");
      lastGatewayOperation = gatewayRequestCategory(init?.method || "GET", target.pathname); lastGatewayHttpStatus = null;
      traffic++; const response = await originalFetch(raw, init); lastGatewayHttpStatus = response.status; return response;
    }) as typeof fetch;
    stage = "fixture-owners-create";
    const owner = await prisma.user.create({ data: { name: "Runtime fixture owner", email: `${randomUUID()}@runtime.invalid`, password: "not-a-login", role: "abogado" } }); userIds.push(owner.id);
    const outsider = await prisma.user.create({ data: { name: "Runtime fixture outsider", email: `${randomUUID()}@runtime.invalid`, password: "not-a-login", role: "abogado" } }); userIds.push(outsider.id);
    const cause = await prisma.causa.create({ data: { titulo: "Runtime fictitious case", tribunal: "Fictitious court", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); causeIds.push(cause.id);
    const organization = await prisma.organization.create({ data: { name: "Disposable runtime fixture", settings: { create: { assistantLlmMode: "remote_allowed" } } } }); organizationId = organization.id;
    stage = "broker-initial-status";
    check((await computerStatus(owner, cause.id)).state === "unconfigured", "No connection may be inferred before configuration");
    stage = "broker-configure";
    const status = await configureComputer(owner, { causaId: cause.id, endpoint, token, provider, dedicated: true }); workspaceId = status.workspaceId!;
    check(!JSON.stringify(status).includes(token), "Gateway secret escaped public state");
    stage = "broker-outsider-denial";
    await assert.rejects(configureComputer(outsider, { endpoint, token, provider, dedicated: true }), error => (error as { status?: number }).status === 409);
    stage = "broker-session-create";
    const session = await createComputerSession(owner, workspaceId, `create-${randomUUID()}`); sessionId = session.id;
    stage = "broker-session-poll";
    await until(() => readComputerSession(owner, session.id), view => view.session.state === "ready");
    stage = "broker-kitty-inspect";
    const stored = await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: session.id } });
    check(stored.kittyId && stored.chatId, "Actual gateway identifiers missing");
    const kittyReply = await originalFetch(`${endpoint}/v1/kitties/${encodeURIComponent(stored.kittyId)}`, { headers: { Authorization: `Bearer ${token}` } }).then(response => { lastGatewayOperation = "kitty_read"; lastGatewayHttpStatus = response.status; return response.json(); });
    check(kittyReply.kitty.desktop === true && kittyReply.kitty.provider === provider && !kittyReply.kitty.container.startsWith("demo-"), "Desktop must be a real configured container");
    stage = "broker-container-inspect";
    const inspected = JSON.parse(await run("docker", ["inspect", kittyReply.kitty.container]))[0]; containerId = inspected.Id;
    check(/^[a-f0-9]{64}$/.test(containerId) && inspected.Image === imageId && inspected.State.Running, "The desktop must run the pre-verified immutable local image");
    check(!inspected.HostConfig.Privileged && inspected.HostConfig.PidMode !== "host" && inspected.HostConfig.IpcMode !== "host" && inspected.HostConfig.NetworkMode === network, "Desktop must not share privileged host namespaces");
    check(!inspected.HostConfig.Devices?.length && !inspected.HostConfig.SecurityOpt?.includes("seccomp=unconfined"), "Desktop must not receive host devices or unconfined seccomp");
    check(inspected.Config.User === "kitty" && inspected.HostConfig.Memory === 2048 * 1024 * 1024 && inspected.HostConfig.NanoCpus === 2_000_000_000, "The desktop must retain its non-root user and requested CPU/memory limits");
    check(inspected.Mounts.length === 1 && inspected.Mounts[0].Type === "bind" && inspected.Mounts[0].Destination === "/home/kitty/work" && resolve(inspected.Mounts[0].Source) === join(work, stored.kittyName), "Only this fixture kitty workspace may be mounted; no host store/socket/home");
    const ports = Object.values(inspected.NetworkSettings.Ports || {}).flat().filter(Boolean) as { HostIp: string }[];
    check(ports.every(port => port.HostIp === "127.0.0.1"), "Desktop ports must bind only to loopback");
    const runtimeEnv = JSON.stringify(inspected.Config.Env);
    for (const secret of [token, modelToken, process.env.SESSION_SECRET!, process.env.DATABASE_URL!]) check(!runtimeEnv.includes(secret), "LexOpen/gateway/model credentials must not enter the desktop environment");
    stage = "desktop-toolchain";
    check(inspected.Config.Labels?.["org.lexopen.altazor.desktop-profile"] === desktopProfile.id &&
      inspected.Config.Labels?.["org.lexopen.altazor.desktop-source"] === KITTIES_SOURCE_COMMIT, "Expected the pinned LexOpen desktop tool profile");
    const toolchain = JSON.parse(await run("docker", ["exec", containerId, "lexopen-desktop-check"], 150_000));
    check(desktopToolchainVerified(toolchain),
      "Document, semantic Office/PDF reading, OCR, bibliography, search, audio and LexOpen wallpaper tests must run inside the actual desktop");
    stage = "screenshot-and-manual-control";
    const png = await until(async () => { try { return await computerScreenshot(owner, session.id); } catch { return null; } }, bytes => Boolean(bytes && bytes.length > 1024));
    check(png && png.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" && png.readUInt32BE(16) >= 640 && png.readUInt32BE(20) >= 480, "Actual screenshot must have PNG bytes and desktop dimensions");
    const beforeDenied = traffic;
    await assert.rejects(readComputerSession(outsider, session.id), error => (error as { status?: number }).status === 404);
    await assert.rejects(computerScreenshot(outsider, session.id), error => (error as { status?: number }).status === 404);
    check(traffic === beforeDenied, "Foreign owner denial must happen before gateway traffic");
    check((await controlComputer(owner, session.id, `hold-${randomUUID()}`, true)).status === "completed", "Actual control takeover was not confirmed");
    await inputComputer(owner, session.id, `click-${randomUUID()}`, { action: "click", args: { x: 5, y: 5 } });
    await inputComputer(owner, session.id, `type-${randomUUID()}`, { action: "type", args: { text: "inert fictitious CI input" } });
    stage = "one-use-secret-keyboard-bridge";
    const fakeSecret = `inert-${randomUUID()}`;
    const savedSecret = await createSecret(owner, { requestId: `secret-${randomUUID()}`, name: "Fictitious keyboard credential", provider: "Fictitious runtime only", kind: "password", value: fakeSecret });
    const target = { sessionId: session.id, origin: "https://fixture.invalid", field: "password" as const, fieldLabel: "Declared synthetic target, not a DOM assertion" };
    const grant = await prepareComputerSecret(owner, session.id, { requestId: `grant-${randomUUID()}`, secretId: savedSecret.secret.id, revision: savedSecret.secret.revision, target, confirmed: true });
    check((await typeComputerSecret(owner, session.id, { grantId: grant.id, target, confirmed: true })).state === "used", "Actual gateway did not confirm one-use keyboard input");
    const typedTraffic = traffic;
    check((await typeComputerSecret(owner, session.id, { grantId: grant.id, target, confirmed: true })).state === "used" && traffic === typedTraffic, "Redeeming a used grant must not contact the gateway again");
    check((await readComputerSession(owner, session.id)).session.held, "Credential typing must leave the actual desktop under human control");
    check(!lastProviderPayload.includes(fakeSecret), "Keyboard secret must not enter the model request");
    const actions = await prisma.altazorComputerAction.findMany({ where: { sessionId: session.id } });
    check(!JSON.stringify(actions).includes(fakeSecret), "Keyboard secret must not enter action receipts");
    await deleteSecret(owner, savedSecret.secret.id, { requestId: `delete-secret-${randomUUID()}`, revision: savedSecret.secret.revision, confirmed: true });
    await controlComputer(owner, session.id, `release-${randomUUID()}`, false);
    stage = "selected-upload-and-actual-chat";
    const file = Buffer.from(`Selected fictitious upload ${randomUUID()}\n`), text = `Read only this fictitious selected file ${randomUUID()}`;
    const task = { requestId: `task-${randomUUID()}`, text, files: [{ name: "chosen-fixture.txt", mime: "text/plain", data: file.toString("base64") }], confirmed: true as const };
    check((await sendComputerMessage(owner, session.id, task)).status === "completed", "Actual gateway did not accept selected task");
    await until(() => readComputerSession(owner, session.id), view => !view.working && view.turns.some(turn => turn.text.includes(responseText)));
    check(providerCalls > 0 && !fixtureError && lastProviderPayload.includes(text) && lastProviderPayload.includes(file.toString("utf8").trim()), "Actual gateway must deliver the selected task/upload to the local provider fixture");
    const sendsBeforeReplay = providerCalls; await sendComputerMessage(owner, session.id, task); check(providerCalls === sendsBeforeReplay, "Same request must not resend the model task");
    const copies = join(root, "upload-copy"); await run("docker", ["cp", `${containerId}:/home/kitty/work/uploads`, copies]); check(await containsFile(copies, file), "Selected bytes must actually reach this container's upload directory");
    stage = "policy-acl-ttl-cancel-and-close";
    await prisma.firmSettings.update({ where: { organizationId }, data: { assistantLlmMode: "local_only" } });
    const beforePolicy = traffic;
    check((await computerStatus(owner, cause.id)).policyAllowed === false, "local_only state must be explicit");
    await assert.rejects(sendComputerMessage(owner, session.id, { ...task, requestId: `blocked-${randomUUID()}` }), error => (error as { status?: number }).status === 403);
    await assert.rejects(inputComputer(owner, session.id, `blocked-input-${randomUUID()}`, { action: "type", args: { text: "must not send" } }), error => (error as { status?: number }).status === 403);
    check(traffic === beforePolicy, "local_only must block before gateway traffic");
    await prisma.firmSettings.update({ where: { organizationId }, data: { assistantLlmMode: "remote_allowed" } });
    await prisma.causa.update({ where: { id: cause.id }, data: { abogadoId: outsider.id } }); const beforeRevocation = traffic;
    await assert.rejects(computerScreenshot(owner, session.id), error => (error as { status?: number }).status === 404); check(traffic === beforeRevocation, "Case revocation must precede gateway traffic");
    await prisma.causa.update({ where: { id: cause.id }, data: { abogadoId: owner.id } });
    await prisma.altazorComputerSession.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } }); const beforeExpiry = traffic;
    await assert.rejects(computerScreenshot(owner, session.id), error => (error as { status?: number }).status === 410); check(traffic === beforeExpiry, "Expired access must precede gateway traffic");
    await prisma.altazorComputerSession.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + 60_000) } });
    // The FIRST inference remains pending: acceptance and cancellation must work
    // before the provider has returned any tool call or response.
    modelMode = "hang-task";
    await sendComputerMessage(owner, session.id, { ...task, requestId: `cancel-${randomUUID()}`, text: "Fictitious pending task for cancellation", files: [] });
    await until(() => readComputerSession(owner, session.id), view => view.working);
    await until(async () => pendingModelRequests, count => count > 0);
    const cancelled = await cancelComputerTask(owner, session.id, `cancel-action-${randomUUID()}`); check(cancelled.result?.cancelled === true, "Actual pending task cancellation was not confirmed");
    await until(() => readComputerSession(owner, session.id), view => !view.working);
    check((await closeComputerSession(owner, session.id, `close-${randomUUID()}`)).result?.stopped === true, "Actual desktop stop was not confirmed");
    check(JSON.parse(await run("docker", ["inspect", containerId]))[0].State.Running === false, "Actual container must be stopped");
    const output = resolve(process.env.KITTIES_CI_OUTPUT!); check(output.startsWith(runnerTemp + sep), "Evidence output must remain in disposable CI directory");
    await mkdir(output, { recursive: true }); await writeFile(join(output, "desktop.png"), png);
    await writeFile(join(output, "summary.json"), JSON.stringify({ result: "passed", sourceCommit: KITTIES_SOURCE_COMMIT, sourceRevision, imageId, architecture, runtime: "real-docker-container", model: "synthetic-local-http-fixture", noPersonalAccounts: true, externalRuntimeEgress: "gateway UID firewall + internal Docker network", toolchain, screenshot: { sha256: createHash("sha256").update(png).digest("hex"), width: png.readUInt32BE(16), height: png.readUInt32BE(20) }, checks: ["owner and case ACL", "TTL", "local_only", "immutable image", "one selected workspace mount", "no host socket or credentials", "actual screenshot and manual control", "one-use Secretos keyboard input and replay without network", "selected bytes in container", "actual gateway chat with synthetic model", "replay without resend", "cancel pending task", "stop actual container"] }, null, 2));
    console.log("ALTAZOR computer runtime PASS: actual isolated Docker desktop, screenshot/input/uploads, owner/ACL/TTL/privacy, chat/cancel/stop; local synthetic model only, no personal account or autonomous model claim.");
  } finally {
    globalThis.fetch = originalFetch;
    if (gateway?.pid) {
      // sudo's PID is not the child gateway's PID. This dedicated CI UID owns no other gateway.
      await run("sudo", ["-n", "pkill", "-TERM", "-u", gatewayUser, "-x", "kitties"]).catch(() => {});
      await new Promise(accept => setTimeout(accept, 1500));
      await run("sudo", ["-n", "pkill", "-KILL", "-u", gatewayUser, "-x", "kitties"]).catch(() => {});
      if (gateway.exitCode === null) gateway.kill("SIGKILL");
    }
    for (const socket of sockets) socket.destroy(); model.closeAllConnections(); await new Promise<void>(accept => model.close(() => accept()));
    if (containerId) await run("docker", ["rm", "-f", containerId]).catch(() => {});
    // A creation may have failed before inspection: clean only our uniquely generated kitty name.
    if (sessionId && !containerId) { const row = await prisma.altazorComputerSession.findUnique({ where: { id: sessionId } }); if (row) { const ids = await run("docker", ["ps", "-aq", "--filter", `label=kitties.name=${row.kittyName}`]).catch(() => ""); for (const id of ids.split(/\s+/).filter(id => /^[a-f0-9]{12,64}$/.test(id))) await run("docker", ["rm", "-f", id]).catch(() => {}); } }
    if (networkCreated) await run("docker", ["network", "rm", network]).catch(() => {});
    await prisma.altazorSecret.deleteMany({ where: { ownerId: { in: userIds } } }); await prisma.altazorSecretReceipt.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.altazorComputerAction.deleteMany({ where: { ownerId: { in: userIds } } }); await prisma.altazorComputerSession.deleteMany({ where: { ownerId: { in: userIds } } });
    if (workspaceId) await prisma.altazorComputerWorkspace.deleteMany({ where: { id: workspaceId, ownerId: { in: userIds } } });
    await prisma.causa.deleteMany({ where: { id: { in: causeIds } } }); await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } }); await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
    check((await readFile(join(root, ".owned-computer-smoke"), "utf8")) === "fictitious-ci-only\n" && relative(runnerTemp, root).startsWith("lexopen-computer-smoke-"), "Cleanup ownership marker mismatch");
    await run("sudo", ["-n", "rm", "-rf", "--", gatewayRoot]); await rm(root, { recursive: true, force: true }); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(`ALTAZOR computer runtime FAILED at ${stage}: ${error instanceof SmokeError ? `${error.message}; ` : ""}${runtimeFailureSummary(error, lastGatewayHttpStatus, lastGatewayOperation)}. Raw gateway logs and credentials are intentionally not printed.`); process.exitCode = 1; });
