import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type CodexNotification = { method: string; params?: Record<string, unknown> };
export type CodexRpcOptions = {
  executable: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv;
  timeoutMs?: number; maxMessageBytes?: number;
};

export class CodexTransportError extends Error {
  readonly status: number;
  constructor(public code: "unavailable" | "closed" | "timeout" | "protocol" | "tools_forbidden" | "remote", message: string) { super(message); this.name = "CodexTransportError"; this.status = code === "timeout" ? 504 : ["protocol", "tools_forbidden", "remote"].includes(code) ? 502 : 503; }
}

/** A bounded JSON-RPC stdio client. It never logs payloads, credentials or stderr. */
export class CodexRpc {
  private readonly child: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private buffer = "";
  private totalBytes = 0;
  private stderrBytes = 0;
  private closed: CodexTransportError | null = null;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private readonly listeners = new Set<(event: CodexNotification) => void>();
  private readonly closeListeners = new Set<(reason: CodexTransportError) => void>();

  constructor(private readonly options: CodexRpcOptions) {
    this.child = spawn(options.executable, options.args, { cwd: options.cwd, env: options.env, shell: false, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", chunk => this.read(String(chunk)));
    // Drain without retaining diagnostics: SDK/provider errors can contain secrets.
    this.child.stderr.on("data", chunk => { this.stderrBytes += Buffer.byteLength(chunk); if (this.stderrBytes > 8 * 1024 * 1024) this.fail(new CodexTransportError("protocol", "Codex superó el límite de diagnóstico permitido.")); });
    this.child.stdin.on("error", () => this.fail(new CodexTransportError("closed", "La conexión con Codex se cerró. Vuelva a intentarlo.")));
    this.child.on("error", error => this.fail(new CodexTransportError((error as NodeJS.ErrnoException).code === "ENOENT" ? "unavailable" : "closed", "Codex CLI no está disponible en este Host. Revise su instalación.")));
    this.child.on("exit", () => this.fail(new CodexTransportError("closed", "Codex se cerró. Vuelva a comprobar la conexión.")));
  }

  get alive() { return this.closed === null; }
  onNotification(listener: (event: CodexNotification) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  onClose(listener: (reason: CodexTransportError) => void) { this.closeListeners.add(listener); return () => { this.closeListeners.delete(listener); }; }

  async initialize() {
    await this.request("initialize", { clientInfo: { name: "lexopen", title: "LexOpen", version: "1.0.0" }, capabilities: { experimentalApi: true } });
    this.notify("initialized");
  }

  request<T = unknown>(method: string, params?: unknown, timeoutMs = this.options.timeoutMs ?? 10_000): Promise<T> {
    if (this.closed) return Promise.reject(this.closed);
    if (this.pending.size >= 8) return Promise.reject(new CodexTransportError("protocol", "Codex tiene demasiadas solicitudes pendientes. Espere e intente de nuevo."));
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new CodexTransportError("timeout", "Codex tardó demasiado en responder. Vuelva a intentarlo.")), timeoutMs);
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer });
      this.write({ id, method, ...(params === undefined ? {} : { params }) });
    });
  }

  notify(method: string, params?: unknown) { this.write({ method, ...(params === undefined ? {} : { params }) }); }
  close(reason = new CodexTransportError("closed", "La conexión con Codex se cerró.")) { this.fail(reason); }

  private write(message: unknown) {
    if (this.closed) return;
    const encoded = JSON.stringify(message) + "\n";
    if (Buffer.byteLength(encoded) > (this.options.maxMessageBytes ?? 2 * 1024 * 1024)) { this.fail(new CodexTransportError("protocol", "La solicitud supera el tamaño permitido para Codex.")); return; }
    this.child.stdin.write(encoded);
  }

  private read(chunk: string) {
    if (this.closed) return;
    this.totalBytes += Buffer.byteLength(chunk);
    this.buffer += chunk;
    if (this.totalBytes > 16 * 1024 * 1024 || Buffer.byteLength(this.buffer) > (this.options.maxMessageBytes ?? 2 * 1024 * 1024)) { this.fail(new CodexTransportError("protocol", "Codex superó el límite de respuesta permitido.")); return; }
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let message: Record<string, unknown>;
      try { const parsed: unknown = JSON.parse(line); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error(); message = parsed as Record<string, unknown>; }
      catch { this.fail(new CodexTransportError("protocol", "Codex devolvió una respuesta no compatible. Actualice Codex CLI.")); return; }
      if (typeof message.method === "string") {
        // LexOpen doesn't expose an approval, shell, MCP or arbitrary action bridge.
        if (message.id !== undefined) {
          this.write({ id: message.id, error: { code: -32601, message: "LexOpen does not permit tool or approval requests" } });
          this.fail(new CodexTransportError("tools_forbidden", "Codex solicitó una herramienta que esta conexión no permite.")); return;
        }
        const params = message.params && typeof message.params === "object" ? message.params as Record<string, unknown> : undefined;
        if (message.method === "item/started") {
          const item = params?.item as { type?: string } | undefined;
          if (item?.type && !["agentMessage", "userMessage", "reasoning", "plan", "contextCompaction"].includes(item.type)) {
            this.fail(new CodexTransportError("tools_forbidden", "Codex intentó usar una herramienta que esta conexión no permite.")); return;
          }
        }
        for (const listener of this.listeners) listener({ method: message.method, params });
      } else if (typeof message.id === "number") {
        const pending = this.pending.get(message.id); if (!pending) continue;
        clearTimeout(pending.timer); this.pending.delete(message.id);
        if (message.error) {
          const error = message.error;
          const code = error && typeof error === "object" && !Array.isArray(error) ? (error as { code?: unknown }).code : undefined;
          const protocolError = typeof code === "number" && [-32600, -32601, -32602].includes(code);
          pending.reject(new CodexTransportError("remote", protocolError
            ? `Codex rechazó el formato de la solicitud (RPC ${code}). Compruebe la compatibilidad de Codex CLI.`
            : "Codex no pudo completar la solicitud. Revise la conexión y vuelva a intentarlo."));
        }
        else if ("result" in message) pending.resolve(message.result);
        else { const reason = new CodexTransportError("protocol", "Codex devolvió una respuesta no compatible."); pending.reject(reason); this.fail(reason); return; }
      }
    }
  }

  private fail(reason: CodexTransportError) {
    if (this.closed) return;
    this.closed = reason;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(reason); }
    this.pending.clear();
    for (const listener of this.closeListeners) listener(reason);
    this.listeners.clear(); this.closeListeners.clear();
    this.child.stdin.destroy(); this.child.kill("SIGTERM");
    const force = setTimeout(() => { if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill("SIGKILL"); }, 1000);
    force.unref();
  }
}
