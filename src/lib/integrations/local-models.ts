import { createHash } from "node:crypto";
import { z } from "zod";
import { httpError } from "@/lib/auth/access";
import { fetchSafeOutbound } from "@/lib/net/safe-url";
import {
  LOCAL_CONTEXT_TOKENS,
  LOCAL_MODELS,
  LOCAL_OUTPUT_TOKENS,
  OLLAMA_LOCAL_ORIGIN,
  type LocalModelProfile,
} from "./local-model-profiles";
import {
  canonicalLocalModelState,
  collectLocalModelHardware,
  localModelInventory,
  localModelRecommendation,
  sanitizeInstalledLocalModels,
} from "./local-model-hardware";

const REGISTRY = "https://registry.ollama.ai";
const MANIFEST_TYPE = "application/vnd.docker.distribution.manifest.v2+json";
const MANIFEST_ACCEPT = `application/vnd.ollama.manifest.list.v2+json, ${MANIFEST_TYPE}`;
// Still bounded by the pinned catalog and each exact manifest size, including larger editions.
const MAX_MODEL_BYTES = Math.max(...LOCAL_MODELS.map(profile => profile.bytes)) + 1;
const MAX_INPUT_BYTES = 12_000;
const MAX_INPUT_MESSAGES = 24;
const MAX_JSON_BYTES = 256 * 1024;
const MAX_PROGRESS_BYTES = 4 * 1024 * 1024;

const daemonStatus = z.object({ cloud: z.object({ disabled: z.boolean() }) });
const installedModels = z.object({
  models: z.array(z.unknown()).max(1000),
});
const layer = z.object({
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  size: z.number().int().positive().max(MAX_MODEL_BYTES),
});
const manifest = z.object({
  schemaVersion: z.literal(2),
  mediaType: z.literal(MANIFEST_TYPE),
  config: layer,
  layers: z.array(layer).min(1).max(32),
});
const progress = z.object({
  status: z.string().optional(),
  error: z.string().optional(),
  digest: z.string().optional(),
  total: z.number().int().nonnegative().optional(),
  completed: z.number().int().nonnegative().optional(),
});
const chat = z.object({
  done: z.literal(true),
  message: z.object({ content: z.string().trim().min(1).max(12_000) }),
  remote_host: z.literal("").optional(),
  remote_model: z.literal("").optional(),
});

type LocalMessage = { role: "system" | "user" | "assistant"; content: string };
type InstallState = "ready" | "missing" | "different";
type RuntimeState = "ready" | "cloud_enabled" | "needs_update" | "unavailable";

function timeout(ms: number, signal?: AbortSignal) {
  const timer = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([timer, signal]) : timer;
}

/** Managed Ollama requests have a fixed numeric destination and carry no credentials. */
function ollama(path: "/api/status" | "/api/tags" | "/api/chat" | "/api/pull", init?: RequestInit) {
  return fetchSafeOutbound(`${OLLAMA_LOCAL_ORIGIN}${path}`, {
    ...init,
    allowHttp: true,
    allowLoopback: true,
    cache: "no-store",
  });
}

async function readText(response: Response, limit = MAX_JSON_BYTES) {
  if (Number(response.headers.get("content-length") || 0) > limit) {
    await response.body?.cancel();
    throw new Error("Respuesta demasiado extensa");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Respuesta vacía");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new Error("Respuesta demasiado extensa");
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks, size).toString("utf8");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function runtimeState(signal?: AbortSignal): Promise<RuntimeState> {
  try {
    const response = await ollama("/api/status", { signal: timeout(3000, signal) });
    if (!response.ok) {
      await response.body?.cancel();
      return response.status === 404 ? "needs_update" : "unavailable";
    }
    const info = daemonStatus.safeParse(JSON.parse(await readText(response)));
    if (!info.success) return "needs_update";
    return info.data.cloud.disabled ? "ready" : "cloud_enabled";
  } catch {
    signal?.throwIfAborted();
    return "unavailable";
  }
}

const runtimeMessages = {
  cloud_enabled: "Desactiva las funciones de nube de Ollama en el Host y reinicia Ollama.",
  needs_update: "Actualiza Ollama para que LexOpen pueda comprobar el modo local.",
  unavailable: "Abre Ollama en el equipo que aloja LexOpen y vuelve a comprobar.",
};

async function readInstalled(signal?: AbortSignal) {
  try {
    const response = await ollama("/api/tags", { signal: timeout(3500, signal) });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("No se pudo consultar Ollama");
    }
    return sanitizeInstalledLocalModels(installedModels.parse(JSON.parse(await readText(response))).models);
  } catch {
    signal?.throwIfAborted();
    throw httpError("No se pudo verificar la lista de modelos de Ollama.", 503);
  }
}

function stateFor(profile: LocalModelProfile, models: Awaited<ReturnType<typeof readInstalled>>): InstallState {
  return canonicalLocalModelState(profile, models);
}

export async function localModelsStatus(signal?: AbortSignal) {
  const [initialRuntime, hardware] = await Promise.all([runtimeState(signal), collectLocalModelHardware(signal)]);
  let runtime = initialRuntime;
  let models: Awaited<ReturnType<typeof readInstalled>> = [];
  if (runtime === "ready") {
    try { models = await readInstalled(signal); }
    catch { signal?.throwIfAborted(); runtime = "unavailable"; }
  }
  const readyIds = LOCAL_MODELS.filter(profile => stateFor(profile, models) === "ready").map(profile => profile.id);
  return {
    runtime,
    message: runtime === "ready" ? "" : runtimeMessages[runtime],
    hardware,
    recommendation: localModelRecommendation(hardware, readyIds),
    ...localModelInventory(models),
    models: LOCAL_MODELS.map((profile) => ({
      id: profile.id,
      state: runtime === "ready" ? stateFor(profile, models) : null,
    })),
  };
}

async function requireLocalRuntime(signal?: AbortSignal) {
  const runtime = await runtimeState(signal);
  if (runtime !== "ready") throw httpError(runtimeMessages[runtime], 503);
}

async function verifiedManifest(profile: LocalModelProfile, signal?: AbortSignal) {
  const [family, tag] = profile.tag.split(":");
  try {
    const response = await fetchSafeOutbound(`${REGISTRY}/v2/library/${family}/manifests/${tag}`, {
      cache: "no-store",
      headers: { Accept: MANIFEST_ACCEPT },
      signal: timeout(10_000, signal),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Registro no disponible");
    }
    const data = await readText(response);
    if (createHash("sha256").update(data).digest("hex") !== profile.sha256) {
      throw httpError("La edición publicada del modelo cambió. Actualiza LexOpen antes de descargarla.", 409);
    }
    const parsed = manifest.parse(JSON.parse(data));
    const blobs = [parsed.config, ...parsed.layers];
    const bytes = blobs.reduce((total, blob) => total + blob.size, 0);
    if (bytes !== profile.bytes || bytes >= MAX_MODEL_BYTES) throw new Error("Tamaño del modelo inesperado");
    return new Map(blobs.map((blob) => [blob.digest, blob.size]));
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof Error && "status" in error) throw error;
    throw httpError("No se pudo verificar la descarga en el registro de Ollama.", 502);
  }
}

async function waitForPull(response: Response, blobs: Map<string, number>) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Descarga sin respuesta");
  const decoder = new TextDecoder();
  let pending = "", bytes = 0, complete = false;
  const observe = (line: string) => {
    if (!line.trim()) return;
    const event = progress.parse(JSON.parse(line));
    if (event.error || !event.status) throw new Error("Ollama rechazó la descarga");
    if (event.digest) {
      const expectedBytes = blobs.get(event.digest);
      if (!expectedBytes || event.total !== expectedBytes || (event.completed ?? 0) > expectedBytes) {
        throw new Error("El bloque descargado no coincide con el manifiesto");
      }
    }
    if (event.status === "success") complete = true;
  };
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_PROGRESS_BYTES) throw new Error("Progreso de descarga demasiado extenso");
      const lines = (pending + decoder.decode(chunk.value, { stream: true })).split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) observe(line);
    }
    observe(pending + decoder.decode());
    if (!complete) throw new Error("Descarga interrumpida");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

let downloading = false;

export async function downloadLocalModel(profile: LocalModelProfile, signal?: AbortSignal) {
  if (downloading) throw httpError("Hay otro modelo descargándose en este Host.", 409);
  downloading = true;
  try {
    await requireLocalRuntime(signal);
    const installed = stateFor(profile, await readInstalled(signal));
    if (installed === "ready") return;
    if (installed === "different") throw httpError("Hay otra edición con ese nombre en Ollama. Elige otro modelo del catálogo.", 409);
    const blobs = await verifiedManifest(profile, signal);
    try {
      const response = await ollama("/api/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: profile.tag, stream: true }),
        signal: timeout(2 * 60 * 60_000, signal),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Ollama no inició la descarga");
      }
      await waitForPull(response, blobs);
    } catch {
      signal?.throwIfAborted();
      throw httpError("No se completó la descarga verificada. Comprueba la conexión y el espacio en disco.", 502);
    }
    if (stateFor(profile, await readInstalled(signal)) !== "ready") {
      throw httpError("La edición descargada no coincide con el modelo verificado.", 502);
    }
  } finally {
    downloading = false;
  }
}

let generating = false;

export async function completeLocalModel(profile: LocalModelProfile, messages: LocalMessage[], options?: { signal?: AbortSignal; timeoutMs?: number }) {
  const signal = options?.signal;
  signal?.throwIfAborted();
  const inputBytes = messages.reduce((total, message) => total + Buffer.byteLength(message.content), 0);
  if (inputBytes > MAX_INPUT_BYTES || messages.length > MAX_INPUT_MESSAGES) {
    throw httpError("Este perfil local trabaja con textos cortos. Reduce el número de pasajes o abre una conversación nueva.", 413);
  }
  if (generating) throw httpError("Ollama ya está atendiendo una solicitud local. Vuelve a intentarlo en un momento.", 429);
  generating = true;
  try {
    await requireLocalRuntime(signal);
    if (stateFor(profile, await readInstalled(signal)) !== "ready") {
      throw httpError("Verifica la instalación del modelo en Configuración → IA local.", 503);
    }
    const response = await ollama("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: profile.tag,
        messages,
        stream: false,
        keep_alive: 0,
        truncate: false,
        shift: false,
        ...(profile.thinking === "level" ? { think: "low" } : profile.thinking === "toggle" ? { think: false } : {}),
        options: { num_ctx: LOCAL_CONTEXT_TOKENS, num_predict: profile.thinking === "level" ? 2048 : LOCAL_OUTPUT_TOKENS, temperature: 0.2 },
      }),
      signal: timeout(Math.min(options?.timeoutMs ?? 90_000, 120_000), signal),
    }).catch(() => {
      signal?.throwIfAborted();
      throw httpError("Ollama no pudo completar la respuesta. Comprueba que esté abierto y tenga memoria disponible.", 503);
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw httpError("Ollama no pudo procesar el texto. Prueba con un pasaje más corto o comprueba la memoria disponible.", 503);
    }
    try {
      return chat.parse(JSON.parse(await readText(response, 64 * 1024))).message.content;
    } catch {
      signal?.throwIfAborted();
      throw httpError("Ollama no devolvió una respuesta local utilizable.", 502);
    }
  } finally {
    generating = false;
  }
}

export async function testLocalModel(profile: LocalModelProfile, signal?: AbortSignal) {
  await completeLocalModel(profile, [{ role: "user", content: "Prueba de conexión de LexOpen con texto ficticio. Responde brevemente con la palabra listo." }], { signal, timeoutMs: 60_000 });
}
