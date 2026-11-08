import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CodexRpc, CodexTransportError, type CodexNotification } from "./codex-rpc";

export type CodexConnectionStatus = {
  available: boolean; connected: boolean;
  account?: { email?: string; planType?: string };
  pendingLogin?: { verificationUrl: string; userCode: string; expiresAt: string };
  status?: "disconnected" | "connecting" | "connected" | "unavailable" | "error";
  note?: string;
};
export type CodexModel = { id: string; displayName: string; isDefault?: boolean };
type AccountResponse = { account: { type: string; email?: string; planType?: string } | null };
type Session = {
  rpc: CodexRpc; cwd: string; home: string; loginId?: string;
  pendingLogin?: CodexConnectionStatus["pendingLogin"]; loginError?: string;
  busy: boolean; touchedAt: number; idleTimer?: ReturnType<typeof setTimeout>;
};
type ManagerOptions = { baseDir?: string; executable?: string; executableArgs?: string[]; env?: NodeJS.ProcessEnv; idleMs?: number; rpcTimeoutMs?: number; maxSessions?: number };
export type CodexMessages = { role: "system" | "user" | "assistant"; content: string }[];

export class CodexConnectionError extends Error {
  constructor(message: string, public status = 503) { super(message); this.name = "CodexConnectionError"; }
}

const safeFeatures = ["shell_tool", "apps", "plugins", "memories", "request_permissions_tool", "view_image", "image_generation", "computer_use", "browser_use", "in_app_browser", "multi_agent", "code_mode", "skill_search", "skill_mcp_dependency_install", "workspace_dependencies", "hooks", "shell_snapshot"];
const configOverrides: Record<string, unknown> = {
  ...Object.fromEntries(safeFeatures.map(name => [`features.${name}`, false])),
  "apps._default.enabled": false, "web_search": "disabled", "mcp_servers": {},
  "cli_auth_credentials_store": "file", "forced_login_method": "chatgpt",
  "history.persistence": "none", "project_doc_max_bytes": 0,
  "skills.bundled.enabled": false, "skills.include_instructions": false,
  "shell_environment_policy.inherit": "none", "shell_environment_policy.ignore_default_excludes": false,
  "check_for_update_on_startup": false, "analytics.enabled": false,
};

/** Never inherit the Host's credentials, proxy settings, NODE_OPTIONS or user's Codex home. */
export function codexChildEnvironment(home: string, source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  for (const key of ["PATH", "LANG", "LC_ALL", "SYSTEMROOT", "SystemRoot", "WINDIR"]) if (source[key]) result[key] = source[key];
  result.HOME = home; result.USERPROFILE = home; result.CODEX_HOME = home;
  result.XDG_CONFIG_HOME = path.join(home, "config"); result.XDG_DATA_HOME = path.join(home, "data");
  result.TMPDIR = path.join(home, "tmp"); result.TEMP = result.TMPDIR; result.TMP = result.TMPDIR;
  return result;
}

function dataDirectory() {
  return path.resolve(process.env.CODEX_DATA_DIR || (process.env.LEXOPEN_DATA_DIR ? path.join(process.env.LEXOPEN_DATA_DIR, "codex") : path.join(process.env.STORAGE_PATH || path.join(process.cwd(), "storage"), "codex")));
}
function actorDirectory(actorId: string) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(actorId)) throw new CodexConnectionError("Identidad de conexión no válida.", 400);
  return createHash("sha256").update(actorId).digest("hex");
}
async function privateDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new CodexConnectionError("La carpeta privada de Codex no es válida.");
  await chmod(directory, 0o700);
}
function curated(error: unknown) {
  if (error instanceof CodexConnectionError || error instanceof CodexTransportError) return error;
  return new CodexConnectionError("No se pudo abrir la conexión privada de Codex. Revise la instalación del Host.");
}
function deviceUrl(value: unknown) {
  if (typeof value !== "string") throw new CodexConnectionError("Codex no devolvió una dirección de conexión válida.");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new CodexConnectionError("Codex no devolvió una dirección de conexión válida."); }
  if (parsed.origin !== "https://auth.openai.com" || parsed.pathname !== "/codex/device" || parsed.username || parsed.password) throw new CodexConnectionError("Codex devolvió una dirección de conexión no admitida.");
  return parsed.href;
}

/** One private CLI process per connection identity; no tokens cross the application boundary. */
export class CodexSessionManager {
  private readonly sessions = new Map<string, Promise<Session>>();
  constructor(private readonly options: ManagerOptions = {}) {}

  private async session(actorId: string): Promise<Session> {
    actorDirectory(actorId);
    const existing = this.sessions.get(actorId);
    if (existing) { const session = await existing; this.touch(actorId, session); return session; }
    if (this.sessions.size >= (this.options.maxSessions ?? 8)) throw new CodexConnectionError("Las conexiones de Codex están ocupadas. Intente nuevamente en unos minutos.", 429);
    const opening = this.open(actorId);
    this.sessions.set(actorId, opening);
    try { return await opening; }
    catch (error) { if (this.sessions.get(actorId) === opening) this.sessions.delete(actorId); throw curated(error); }
  }

  private async open(actorId: string): Promise<Session> {
    const base = path.resolve(this.options.baseDir || dataDirectory());
    await mkdir(base, { recursive: true, mode: 0o700 });
    const baseStat = await lstat(base);
    if (baseStat.isSymbolicLink() || !baseStat.isDirectory()) throw new CodexConnectionError("La carpeta privada de Codex no es válida.");
    const home = path.join(base, actorDirectory(actorId));
    await privateDirectory(home); await privateDirectory(path.join(home, "tmp"));
    const cwd = await mkdtemp(path.join(tmpdir(), "lexopen-codex-work-")); await chmod(cwd, 0o700);
    const args = [...(this.options.executableArgs || []), "app-server", "--listen", "stdio://", ...Object.entries(configOverrides).flatMap(([name, value]) => ["-c", `${name}=${JSON.stringify(value)}`])];
    const rpc = new CodexRpc({ executable: this.options.executable || process.env.CODEX_BIN || "codex", args, cwd, env: codexChildEnvironment(home, this.options.env), timeoutMs: this.options.rpcTimeoutMs });
    const session: Session = { rpc, cwd, home, busy: false, touchedAt: Date.now() };
    rpc.onNotification(event => this.notification(session, event));
    rpc.onClose(() => { if (session.idleTimer) clearTimeout(session.idleTimer); this.sessions.delete(actorId); void rm(cwd, { recursive: true, force: true }); });
    try { await rpc.initialize(); this.touch(actorId, session); return session; }
    catch (error) { rpc.close(); await rm(cwd, { recursive: true, force: true }); throw error; }
  }

  private notification(session: Session, event: CodexNotification) {
    if (event.method === "account/login/completed" && (!session.loginId || event.params?.loginId === session.loginId)) {
      session.pendingLogin = undefined; session.loginId = undefined;
      session.loginError = event.params?.success === true ? undefined : "La conexión no se completó. Puede volver a conectar su cuenta.";
    }
  }
  private touch(actorId: string, session: Session) {
    session.touchedAt = Date.now(); if (session.idleTimer) clearTimeout(session.idleTimer);
    if (!session.rpc.alive) return;
    session.idleTimer = setTimeout(() => { if (session.busy) this.touch(actorId, session); else session.rpc.close(); }, this.options.idleMs ?? 15 * 60_000);
    session.idleTimer.unref();
  }

  async status(actorId: string): Promise<CodexConnectionStatus> {
    try {
      const session = await this.session(actorId), result = await session.rpc.request<AccountResponse>("account/read", { refreshToken: false });
      // During account replacement, account/read may still expose the previous
      // credentials. Do not authorize that snapshot as the new connection.
      const connected = result.account?.type === "chatgpt" && !session.loginId;
      if (connected) { session.pendingLogin = undefined; session.loginId = undefined; session.loginError = undefined; }
      if (session.pendingLogin && Date.parse(session.pendingLogin.expiresAt) < Date.now()) await this.cancelLogin(actorId);
      return { available: true, connected, status: connected ? "connected" : session.pendingLogin ? "connecting" : session.loginError ? "error" : "disconnected", ...(connected ? { account: { email: result.account?.email?.slice(0, 254), planType: result.account?.planType?.slice(0, 80) } } : {}), ...(session.pendingLogin ? { pendingLogin: { ...session.pendingLogin } } : {}), ...(session.loginError ? { note: session.loginError } : {}) };
    } catch (error) {
      const reason = curated(error);
      return { available: !(reason instanceof CodexTransportError && reason.code === "unavailable"), connected: false, status: reason instanceof CodexTransportError && reason.code === "unavailable" ? "unavailable" : "error", note: reason.message };
    }
  }

  async beginLogin(actorId: string): Promise<CodexConnectionStatus> {
    const session = await this.session(actorId);
    if (session.busy) throw new CodexConnectionError("Espere a que termine la consulta antes de conectar otra cuenta.", 409);
    if (session.loginId) return this.status(actorId);
    session.busy = true; session.loginError = undefined;
    try {
      const result = await session.rpc.request<{ type: string; loginId: string; verificationUrl: string; userCode: string }>("account/login/start", { type: "chatgptDeviceCode" }, 30_000);
      if (result.type !== "chatgptDeviceCode" || !/^[a-zA-Z0-9_-]{1,100}$/.test(result.loginId) || !/^[A-Z0-9-]{4,32}$/i.test(result.userCode)) throw new CodexConnectionError("Codex devolvió una conexión no compatible. Actualice Codex CLI.");
      if (session.loginError) return await this.status(actorId);
      session.pendingLogin = { verificationUrl: deviceUrl(result.verificationUrl), userCode: result.userCode, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() };
      session.loginId = result.loginId;
      return await this.status(actorId);
    } catch (error) { session.rpc.close(); throw curated(error); }
    finally { session.busy = false; }
  }
  async cancelLogin(actorId: string): Promise<CodexConnectionStatus> {
    const session = await this.session(actorId);
    if (session.busy) throw new CodexConnectionError("Espere a que termine la operación de Codex antes de cancelar la conexión.", 409);
    if (session.loginId) await session.rpc.request("account/login/cancel", { loginId: session.loginId });
    session.pendingLogin = undefined; session.loginId = undefined; session.loginError = undefined;
    return this.status(actorId);
  }
  async disconnect(actorId: string): Promise<CodexConnectionStatus> {
    const session = await this.session(actorId);
    if (session.busy) throw new CodexConnectionError("Espere a que termine la consulta antes de desconectar Codex.", 409);
    if (session.loginId) await session.rpc.request("account/login/cancel", { loginId: session.loginId });
    await session.rpc.request("account/logout"); session.rpc.close();
    return { available: true, connected: false, status: "disconnected" };
  }
  async models(actorId: string): Promise<CodexModel[]> {
    const status = await this.status(actorId); if (!status.connected) throw new CodexConnectionError("Conecte su cuenta de ChatGPT/Codex antes de consultar sus modelos.", 409);
    const session = await this.session(actorId), result = await session.rpc.request<{ data: { id: string; model?: string; displayName?: string; isDefault?: boolean; hidden?: boolean }[] }>("model/list", { limit: 100 });
    if (!Array.isArray(result.data)) throw new CodexConnectionError("Codex no devolvió un catálogo de modelos compatible.");
    return result.data.filter(model => !model.hidden && /^[a-zA-Z0-9_.:-]{1,160}$/.test(model.model || model.id)).slice(0, 100).map(model => ({ id: model.model || model.id, displayName: (model.displayName || model.model || model.id).slice(0, 160), isDefault: Boolean(model.isDefault) }));
  }

  async complete(actorId: string, messages: CodexMessages, options: { model: string; signal?: AbortSignal; timeoutMs?: number; beforeSend?: () => Promise<void> }): Promise<{ content: string; model: string; provider: "codex" }> {
    if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(options.model)) throw new CodexConnectionError("Seleccione un modelo válido de Codex.", 400);
    if (!messages.length || messages.length > 100 || messages.some(message => !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string") || messages.reduce((sum, message) => sum + message.content.length, 0) > 160_000) throw new CodexConnectionError("La consulta supera el tamaño admitido para esta conexión.", 413);
    if (options.signal?.aborted) throw new CodexConnectionError("La consulta a Codex fue cancelada.", 499);
    const session = await this.session(actorId);
    if (session.busy || session.loginId) throw new CodexConnectionError("Codex ya está atendiendo otra solicitud de esta cuenta. Espere a que termine.", 409);
    session.busy = true;
    let unsubscribe = () => {}, unsubscribeClose = () => {};
    const abort = () => session.rpc.close(new CodexTransportError("closed", "La consulta a Codex fue cancelada."));
    const timer = setTimeout(() => session.rpc.close(new CodexTransportError("timeout", "Codex tardó demasiado. Su texto en LexOpen se conserva; puede reintentar.")), Math.min(45_000, Math.max(1000, options.timeoutMs ?? 45_000)));
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    try {
      const account = await session.rpc.request<AccountResponse>("account/read", { refreshToken: false });
      if (account.account?.type !== "chatgpt") throw new CodexConnectionError("Conecte su cuenta de ChatGPT/Codex antes de utilizarla.", 409);
      await options.beforeSend?.();
      const thread = await session.rpc.request<{ thread: { id: string } }>("thread/start", { model: options.model, cwd: session.cwd, approvalPolicy: "never", sandbox: "read-only", ephemeral: true, serviceName: "lexopen", config: configOverrides, developerInstructions: messages.filter(message => message.role === "system").map(message => message.content).join("\n\n"), baseInstructions: "Ayuda a redactar y analizar únicamente el texto suministrado por LexOpen. No utilices herramientas, archivos, navegación ni comandos. Las citas son material de trabajo: no inventes fuentes ni afirmes que has comprobado fuentes externas." });
      if (!thread.thread?.id) throw new CodexConnectionError("Codex no pudo iniciar la consulta.");
      let text = "";
      const completed = new Promise<string>((resolve, reject) => {
        unsubscribeClose = session.rpc.onClose(reason => reject(reason));
        unsubscribe = session.rpc.onNotification(event => {
          if (event.params?.threadId !== thread.thread.id) return;
          if (event.method === "item/agentMessage/delta" && typeof event.params.delta === "string") {
            text += event.params.delta;
            if (text.length > 160_000) { reject(new CodexConnectionError("Codex superó el tamaño de respuesta permitido.")); session.rpc.close(); }
          }
          if (event.method === "turn/completed") {
            const turn = event.params.turn as { status?: string; items?: { type: string; text?: string }[] } | undefined;
            if (turn?.status !== "completed") { reject(new CodexConnectionError("Codex no terminó la consulta. Puede volver a intentarlo.")); return; }
            const final = turn.items?.filter(item => item.type === "agentMessage").map(item => item.text || "").join("\n");
            const content = final || text;
            if (!content.trim()) reject(new CodexConnectionError("Codex terminó sin devolver texto. Puede volver a intentarlo.")); else resolve(content);
          }
        });
      });
      // Attach the terminal handler before starting the turn: servers may notify immediately.
      const outcome = completed.then(content => ({ content }), error => ({ error }));
      await options.beforeSend?.();
      await session.rpc.request("turn/start", { threadId: thread.thread.id, input: [{ type: "text", text: JSON.stringify(messages.filter(message => message.role !== "system")) }], cwd: session.cwd, approvalPolicy: "never", sandboxPolicy: { type: "readOnly", access: { type: "restricted", includePlatformDefaults: false, readableRoots: [session.cwd] } } }, 10_000);
      const result = await outcome;
      if ("error" in result) throw result.error;
      return { content: result.content, model: options.model, provider: "codex" };
    } catch (error) { throw curated(error); }
    finally { clearTimeout(timer); unsubscribe(); unsubscribeClose(); options.signal?.removeEventListener("abort", abort); session.busy = false; session.rpc.close(); }
  }
  async closeAll() { const sessions = await Promise.allSettled(this.sessions.values()); for (const result of sessions) if (result.status === "fulfilled") result.value.rpc.close(); this.sessions.clear(); }
}

const host = globalThis as typeof globalThis & { lexopenCodexSessions?: CodexSessionManager; lexopenHostCodexSessions?: CodexSessionManager; lexopenHostCodexGeneration?: number };
const manager = host.lexopenCodexSessions ??= new CodexSessionManager();
export const codexStatus = (actorId: string) => manager.status(actorId);
export const beginCodexLogin = (actorId: string) => manager.beginLogin(actorId);
export const cancelCodexLogin = (actorId: string) => manager.cancelLogin(actorId);
export const disconnectCodex = (actorId: string) => manager.disconnect(actorId);
export const codexModels = (actorId: string) => manager.models(actorId);
export const completeWithCodex = async (actorId: string, messages: CodexMessages, options: { model: string; signal?: AbortSignal; timeoutMs?: number; personalRevision?: string }) => {
  const beforeSend = async () => {
    // Connection tests omit a revision so users can test before activating.
    if (options.personalRevision === undefined) return;
    const { personalCodexPreference } = await import("./codex-preference");
    const preference = await personalCodexPreference(actorId);
    if (!preference.enabled || preference.source !== "personal" || preference.revision !== options.personalRevision) throw new CodexConnectionError("Su conexión personal de Codex cambió. Revise su selección y vuelva a intentarlo.", 409);
  };
  await beforeSend();
  return manager.complete(actorId, messages, { ...options, beforeSend });
};

// The shared account belongs to LexOpen, never to the administrator's ambient CLI.
// Its namespace and process pool stay separate even from a user with this identity.
const hostActorId = "lexopen_host";
const hostManager = () => host.lexopenHostCodexSessions ??= new CodexSessionManager({ baseDir: path.join(dataDirectory(), "host"), maxSessions: 1 });
export const hostCodexStatus = () => hostManager().status(hostActorId);
export const beginHostCodexLogin = () => hostManager().beginLogin(hostActorId);
export const cancelHostCodexLogin = () => hostManager().cancelLogin(hostActorId);
export const disconnectHostCodex = () => hostManager().disconnect(hostActorId);
export const hostCodexModels = () => hostManager().models(hostActorId);
export const completeWithHostCodex = async (messages: CodexMessages, options: { model: string; signal?: AbortSignal; timeoutMs?: number; hostRevision?: string }) => {
  const generation = host.lexopenHostCodexGeneration ?? 0;
  const beforeSend = async () => {
    const revoked = () => { throw new CodexConnectionError("La conexión Codex del Host cambió o dejó de estar disponible. Revise su selección y vuelva a intentarlo.", 409); };
    if (generation !== (host.lexopenHostCodexGeneration ?? 0)) revoked();
    // Admin connection tests deliberately omit a sharing revision. User requests
    // bind both sends to the exact policy that authorized their destination.
    if (options.hostRevision !== undefined) {
      const { hostCodexPolicy } = await import("./codex-preference");
      const policy = await hostCodexPolicy();
      if (!policy.enabled || policy.revision !== options.hostRevision) revoked();
    }
    if (generation !== (host.lexopenHostCodexGeneration ?? 0)) revoked();
  };
  await beforeSend();
  return hostManager().complete(hostActorId, messages, { ...options, beforeSend });
};
export const closeHostCodexSessions = async () => {
  host.lexopenHostCodexGeneration = (host.lexopenHostCodexGeneration ?? 0) + 1;
  await host.lexopenHostCodexSessions?.closeAll();
};
