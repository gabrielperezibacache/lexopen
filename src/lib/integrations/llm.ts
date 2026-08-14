import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import {
  fetchSafeOutbound,
  isLoopbackHostname,
  isSafeOutboundHttpUrl,
} from "@/lib/net/safe-url";
import { safeJsonParse } from "@/lib/safe-json";
import { decryptSecret, encryptSecret } from "@/lib/pjud/secret";

export type LlmPreset =
  | "openai"
  | "azure"
  | "groq"
  | "ollama"
  | "hermes"
  | "custom";

export type LlmConfig = {
  preset: LlmPreset;
  apiUrl: string;
  apiKey?: string;
  model: string;
  requireApproval: boolean;
  allowDemo: boolean;
};

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const LLM_PRESETS: Record<
  Exclude<LlmPreset, "custom" | "azure">,
  { label: string; apiUrl: string; model: string }
> = {
  openai: {
    label: "OpenAI",
    apiUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  groq: {
    label: "Groq",
    apiUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  },
  ollama: {
    label: "Ollama (local)",
    apiUrl: "http://localhost:11434/v1",
    model: "llama3.2",
  },
  hermes: {
    label: "Hermes Agent",
    apiUrl: "http://localhost:8642/v1",
    model: "hermes-legal",
  },
};

export const LLM_PRESET_CATALOG: Record<
  LlmPreset,
  { label: string; apiUrl: string; model: string }
> = {
  ...LLM_PRESETS,
  azure: {
    label: "Azure OpenAI",
    apiUrl:
      "https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT",
    model: "gpt-4o-mini",
  },
  custom: {
    label: "Personalizado (OpenAI-compatible)",
    apiUrl: "",
    model: "",
  },
};

function inferPreset(apiUrl: string): LlmPreset {
  if (apiUrl.includes("api.openai.com")) return "openai";
  if (apiUrl.includes("groq.com")) return "groq";
  if (apiUrl.includes("11434")) return "ollama";
  if (apiUrl.includes("8642") || apiUrl.includes("hermes")) return "hermes";
  if (apiUrl.includes("azure") || apiUrl.includes("openai.azure")) return "azure";
  return "custom";
}

function defaultsFromEnv(): LlmConfig {
  const apiUrl =
    process.env.LLM_API_URL ||
    process.env.HERMES_API_URL ||
    LLM_PRESETS.openai.apiUrl;
  const apiKey =
    process.env.LLM_API_KEY || process.env.HERMES_API_KEY || undefined;
  const model =
    process.env.LLM_MODEL ||
    process.env.HERMES_MODEL ||
    LLM_PRESETS.openai.model;
  const allowDemo =
    process.env.LLM_ALLOW_DEMO === "1" ||
    process.env.HERMES_ALLOW_DEMO === "1" ||
    (process.env.LLM_ALLOW_DEMO !== "0" &&
      process.env.HERMES_ALLOW_DEMO !== "0" &&
      process.env.NODE_ENV !== "production");

  return {
    preset: inferPreset(apiUrl),
    apiUrl,
    apiKey,
    model,
    requireApproval: true,
    allowDemo,
  };
}

async function loadConfigRow() {
  const llm = await prisma.integrationConfig.findUnique({
    where: { provider: "llm" },
  });
  if (llm) return llm;
  return prisma.integrationConfig.findUnique({
    where: { provider: "hermes" },
  });
}

function isLegacyPlaintextApiKey(raw: string | undefined) {
  return Boolean(raw && raw !== "••••" && !raw.startsWith("enc:v2:"));
}

function resolveStoredApiKey(raw: string | undefined, fallback?: string) {
  if (raw === "••••" || raw === "") return fallback;
  if (!raw) return fallback;
  if (raw.startsWith("enc:v2:")) {
    return decryptSecret(raw, { strict: true }) || fallback;
  }
  // Legacy plaintext — accepted once so getLlmConfig can re-encrypt on save.
  return raw;
}

/** Prevents getLlmConfig → saveLlmConfig → getLlmConfig recursion during migration. */
let migratingPlaintextApiKey = false;

export async function getLlmConfig(): Promise<LlmConfig> {
  const defaults = defaultsFromEnv();
  const [row, firm] = await Promise.all([
    loadConfigRow(),
    prisma.firmSettings.findFirst({ select: { hermesAllowDemo: true } }),
  ]);
  const parsed = row
    ? safeJsonParse<Partial<LlmConfig>>(row.configJson, {})
    : {};
  const hadPlaintextKey = isLegacyPlaintextApiKey(parsed.apiKey);
  const merged: LlmConfig = {
    ...defaults,
    ...parsed,
    apiKey: resolveStoredApiKey(parsed.apiKey, defaults.apiKey),
  };
  if (parsed.allowDemo === undefined && firm) {
    merged.allowDemo = Boolean(firm.hermesAllowDemo);
  }
  merged.allowDemo = resolveAllowDemoFlag(merged.allowDemo);
  if (!merged.preset) merged.preset = inferPreset(merged.apiUrl);
  // One-shot upgrade: rewrite plaintext API keys as enc:v2.
  if (hadPlaintextKey && merged.apiKey && !migratingPlaintextApiKey) {
    migratingPlaintextApiKey = true;
    void saveLlmConfig({
      enabled: row?.enabled,
      config: { apiKey: merged.apiKey },
    })
      .catch((error) => {
        console.warn("[llm] no se pudo migrar API key plaintext → enc:v2", error);
      })
      .finally(() => {
        migratingPlaintextApiKey = false;
      });
  }
  return merged;
}

export function publicLlmConfig(config: LlmConfig) {
  return {
    ...config,
    apiKey: config.apiKey ? "••••" : "",
    hasApiKey: Boolean(config.apiKey),
  };
}

export { llmEnvSnippet } from "@/lib/integrations/llm-env-snippet";

export function applyPreset(
  preset: LlmPreset,
  current?: Partial<LlmConfig>
): Partial<LlmConfig> {
  if (preset === "custom" || preset === "azure") {
    return { preset, ...(current || {}) };
  }
  const p = LLM_PRESETS[preset];
  return {
    preset,
    apiUrl: p.apiUrl,
    model: current?.model || p.model,
  };
}

/**
 * Env always wins when set. In production, demo is fail-closed unless
 * LLM_ALLOW_DEMO=1 or HERMES_ALLOW_DEMO=1 (DB/UI alone cannot reopen it).
 */
export function resolveAllowDemoFlag(dbOrFirmAllowDemo: boolean): boolean {
  if (
    process.env.LLM_ALLOW_DEMO === "0" ||
    process.env.HERMES_ALLOW_DEMO === "0"
  ) {
    return false;
  }
  if (
    process.env.LLM_ALLOW_DEMO === "1" ||
    process.env.HERMES_ALLOW_DEMO === "1"
  ) {
    return true;
  }
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return Boolean(dbOrFirmAllowDemo);
}

function allowLocalLlmUrl() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.HERMES_ALLOW_PRIVATE_URL === "1" ||
    process.env.LLM_ALLOW_PRIVATE_URL === "1"
  );
}

function isAllowedLlmUrl(value: string) {
  const allowLocal = allowLocalLlmUrl();
  if (
    isSafeOutboundHttpUrl(value, {
      allowHttp: allowLocal || process.env.NODE_ENV !== "production",
      allowLoopback: allowLocal,
    })
  ) {
    return true;
  }
  try {
    const url = new URL(value);
    return (
      allowLocal &&
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      isLoopbackHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

export async function saveLlmConfig(input: {
  enabled?: boolean;
  config: Partial<LlmConfig>;
}) {
  const current = await getLlmConfig();
  let next: LlmConfig = { ...current, ...input.config };
  if (input.config.preset && input.config.preset !== "custom") {
    next = {
      ...next,
      ...applyPreset(input.config.preset, {
        ...next,
        apiUrl: input.config.apiUrl || next.apiUrl,
        model: input.config.model || next.model,
      }),
      apiKey: input.config.apiKey ?? current.apiKey,
      apiUrl: input.config.apiUrl || next.apiUrl,
      model: input.config.model || next.model,
    };
  }
  if (input.config.apiKey === "••••" || input.config.apiKey === "") {
    next.apiKey = current.apiKey;
  }
  if (input.config.apiKey === null) {
    next.apiKey = undefined;
  }

  if (!isAllowedLlmUrl(next.apiUrl)) {
    throw httpError(
      "La URL del endpoint de IA no está permitida (host privado o formato inválido). En producción use HTTPS público, o active LLM_ALLOW_PRIVATE_URL=1 para Ollama/Hermes local.",
      400
    );
  }

  const payload = {
    preset: next.preset,
    apiUrl: next.apiUrl.replace(/\/+$/, ""),
    apiKey: next.apiKey ? encryptSecret(next.apiKey) : "",
    model: next.model,
    requireApproval: next.requireApproval,
    allowDemo: next.allowDemo,
  };
  const payloadJson = JSON.stringify(payload);
  const enabled = Boolean(input.enabled ?? true);

  await prisma.integrationConfig.upsert({
    where: { provider: "llm" },
    create: {
      provider: "llm",
      enabled,
      configJson: payloadJson,
    },
    update: {
      enabled,
      configJson: payloadJson,
    },
  });

  // Keep hermes row in sync for legacy consumers / copiloto (full payload).
  await prisma.integrationConfig.upsert({
    where: { provider: "hermes" },
    create: {
      provider: "hermes",
      enabled,
      configJson: payloadJson,
    },
    update: {
      enabled,
      configJson: payloadJson,
    },
  });

  return { ...next, apiUrl: payload.apiUrl };
}

/** Trim/filter chat messages before sending to any OpenAI-compatible provider. */
export function sanitizeLlmMessages(
  messages: LlmMessage[],
  maxMessages = 24,
  maxChars = 12000
): LlmMessage[] {
  const cleaned = messages
    .filter(
      (m) =>
        m &&
        (m.role === "system" || m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, maxChars),
    }));
  if (cleaned.length <= maxMessages) return cleaned;
  const system = cleaned.filter((m) => m.role === "system").slice(0, 1);
  const rest = cleaned
    .filter((m) => m.role !== "system")
    .slice(-(maxMessages - system.length));
  return [...system, ...rest];
}

type ChatCompletionShape = {
  choices?: Array<{
    message?: { content?: unknown };
    delta?: { content?: unknown };
    text?: unknown;
  }>;
  delta?: unknown;
};

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text || "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

function contentFromCompletion(data: unknown): {
  message: string;
  delta: string;
} {
  if (!data || typeof data !== "object") return { message: "", delta: "" };
  const obj = data as ChatCompletionShape;
  const choice = obj.choices?.[0];
  return {
    message: textFromContent(choice?.message?.content) || textFromContent(choice?.text),
    delta: textFromContent(choice?.delta?.content),
  };
}

export function looksLikeSse(raw: string) {
  const head = raw.trimStart().slice(0, 32);
  return /^data\s*:/.test(head) || /\r?\ndata\s*:/.test(raw.slice(0, 2000));
}

/** JSON clásico o SSE (`data: {...}`) de /chat/completions. */
export function parseChatCompletionBody(raw: string): string {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return "";

  if (text.startsWith("{")) {
    const parsed = safeJsonParse<unknown>(text, null);
    const fromJson = contentFromCompletion(parsed).message.trim();
    if (fromJson) return fromJson;
  }

  if (looksLikeSse(text)) {
    let deltas = "";
    let lastMessage = "";
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      const parsed = safeJsonParse<unknown>(payload, null);
      const { message, delta } = contentFromCompletion(parsed);
      if (delta) deltas += delta;
      if (message) lastMessage = message;
    }
    return (deltas || lastMessage).trim();
  }

  return "";
}

export type LlmClientError = {
  code:
    | "llm_unreachable"
    | "llm_http_4xx"
    | "llm_http_5xx"
    | "llm_bad_response"
    | "llm_invalid_url";
  message: string;
};

/** Stable client-facing error; logs raw upstream detail server-side only. */
export function classifyLlmProviderError(err: unknown): LlmClientError {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn("[llm] provider error:", msg.slice(0, 500));

  if (
    /Unexpected token ['"]d['"]/.test(msg) ||
    /"data:\s*\{/.test(msg) ||
    /stream SSE/i.test(msg)
  ) {
    return {
      code: "llm_bad_response",
      message:
        "El proveedor respondió en un formato no usable. Use un endpoint compatible con OpenAI (`…/v1`).",
    };
  }
  const httpMatch = msg.match(/LLM HTTP (\d{3})/);
  if (httpMatch) {
    const status = Number(httpMatch[1]);
    if (status >= 400 && status < 500) {
      return {
        code: "llm_http_4xx",
        message:
          "El proveedor rechazó la solicitud. Revise la API key, el modelo o la cuota.",
      };
    }
    return {
      code: "llm_http_5xx",
      message: "El proveedor tuvo un error interno. Intente de nuevo más tarde.",
    };
  }
  if (/URL|inválida|no permitida/i.test(msg)) {
    return {
      code: "llm_invalid_url",
      message: "La URL del proveedor de IA no es válida o no está permitida.",
    };
  }
  return {
    code: "llm_unreachable",
    message:
      "No se pudo conectar con el proveedor de IA. Revise el endpoint y la API key.",
  };
}

/** @deprecated Prefer classifyLlmProviderError — returns public message only. */
export function describeLlmProviderError(err: unknown) {
  return classifyLlmProviderError(err).message;
}

export async function askLlm(params: {
  messages: LlmMessage[];
  causaId?: string;
  userId?: string;
  utilityLabel?: string;
  timeoutMs?: number;
}) {
  const config = await getLlmConfig();
  const messages = sanitizeLlmMessages(params.messages);
  if (!messages.some((m) => m.role === "user")) {
    return {
      source: "error" as const,
      content: "",
      requireApproval: true,
      provider: config.preset,
      model: config.model,
      note: "Prompt vacío: indique una instrucción para el copiloto.",
    };
  }

  let apiUrl: URL;
  try {
    apiUrl = new URL(config.apiUrl);
    if (!isAllowedLlmUrl(config.apiUrl)) {
      return {
        source: "error" as const,
        content: "",
        requireApproval: true,
        provider: config.preset,
        model: config.model,
        note: "La URL del proveedor de IA no está permitida (host privado o inseguro).",
        error: "llm_invalid_url",
        code: "llm_invalid_url" as const,
      };
    }
    if (
      (apiUrl.protocol !== "http:" && apiUrl.protocol !== "https:") ||
      apiUrl.username ||
      apiUrl.password
    ) {
      throw new Error("URL de proveedor IA inválida");
    }
  } catch {
    return {
      source: "error" as const,
      content: "",
      requireApproval: true,
      provider: config.preset,
      model: config.model,
      note: "La URL del proveedor de IA no es válida.",
      error: "llm_invalid_url",
      code: "llm_invalid_url" as const,
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const allowLocal = allowLocalLlmUrl();

  try {
    const endpoint = `${apiUrl.toString().replace(/\/+$/, "")}/chat/completions`;
    const res = await fetchSafeOutbound(endpoint, {
      allowHttp: allowLocal || process.env.NODE_ENV !== "production",
      allowLoopback: allowLocal,
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.2,
        stream: false,
      }),
      signal: AbortSignal.timeout(params.timeoutMs || 45_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `LLM HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`
      );
    }

    const raw = await res.text();
    const parsed = parseChatCompletionBody(raw);
    const content =
      parsed ||
      (looksLikeSse(raw)
        ? ""
        : "El proveedor no devolvió contenido.");
    if (!content) {
      throw new Error(
        "El proveedor respondió con un stream SSE sin texto usable. Use un endpoint OpenAI-compatible `{base}/v1` (LexOpen llama a `/chat/completions` con stream:false)."
      );
    }

    if (params.causaId) {
      await prisma.activity.create({
        data: {
          tipo: "ia",
          mensaje: `IA (${config.preset}): ${content.slice(0, 180)}${
            content.length > 180 ? "…" : ""
          }`,
          causaId: params.causaId,
          userId: params.userId,
        },
      });
    }

    return {
      source: "llm" as const,
      content,
      requireApproval: config.requireApproval,
      provider: config.preset,
      model: config.model,
    };
  } catch (err) {
    const classified = classifyLlmProviderError(err);
    if (!config.allowDemo) {
      return {
        source: "error" as const,
        content: "",
        requireApproval: true,
        provider: config.preset,
        model: config.model,
        note:
          "No se pudo contactar al proveedor de IA. Revise el endpoint y la API key en Configuración → IA, o active respuestas de demostración (en producción requiere LLM_ALLOW_DEMO=1 en el Host).",
        error: classified.message,
        code: classified.code,
      };
    }
    const lastUser = [...params.messages]
      .reverse()
      .find((m) => m.role === "user");
    const demo = buildDemoReply(lastUser?.content || "", params.utilityLabel);
    if (params.causaId) {
      await prisma.activity.create({
        data: {
          tipo: "ia",
          mensaje: `IA (demo): ${demo.slice(0, 180)}…`,
          causaId: params.causaId,
          userId: params.userId,
        },
      });
    }
    return {
      source: "demo" as const,
      content: demo,
      requireApproval: true,
      provider: config.preset,
      model: config.model,
      note: "⚠ Modo demo: proveedor no alcanzable. Esta respuesta NO es del modelo real.",
    };
  }
}

export async function testLlmConnection() {
  const result = await askLlm({
    messages: [
      {
        role: "user",
        content: "Responde solo con la palabra OK.",
      },
    ],
    timeoutMs: 15_000,
  });
  return {
    ok: result.source === "llm",
    source: result.source,
    model: result.model,
    provider: result.provider,
    preview: result.content.slice(0, 120),
    note: "note" in result ? result.note : undefined,
    error: "error" in result ? result.error : undefined,
    code: "code" in result ? result.code : undefined,
  };
}

function buildDemoReply(prompt: string, utilityLabel?: string) {
  return `## Copiloto LexOpen (demo local)

**Modo:** ${utilityLabel || "copilot"}
**Consulta:** ${prompt.slice(0, 500) || "(vacía)"}

### Qué haría el asistente con un proveedor conectado
1. Anclar la respuesta a la causa, documentos indexados y plazos del estudio.
2. Citar fuentes locales (movimientos, PDF extraídos, jurisprudencia del corpus).
3. Proponer un borrador o plan de trabajo etiquetado para revisión humana.

### Borrador sugerido
- Hechos en orden cronológico (solo con datos verificados del expediente LexOpen).
- Fundamentos con citas **del corpus disponible**; si faltan, marcar [REVISAR].
- Petitorio / próximos pasos operativos.

> **Aprobación humana requerida.** LexOpen no reemplaza el criterio del abogado ni fuentes oficiales.
`;
}

export function legalSystemPrompt(
  opts?:
    | string
    | {
        context?: string;
        utilityHint?: string;
        alerts?: string[];
      }
) {
  const normalized =
    typeof opts === "string" ? { context: opts } : opts || {};
  const alerts =
    normalized.alerts?.length ?
      `\nAlertas operativas del host:\n${normalized.alerts.map((a) => `- ${a}`).join("\n")}`
    : "";
  return `Eres el copiloto jurídico de LexOpen para un estudio de abogados en Chile
(inspirado en asistentes tipo Julia.cl: entiende la petición, usa contexto del estudio,
recuerda el hilo y cita fuentes verificables del propio host).

Reglas:
- Español chileno formal y claro.
- NO inventes sentencias, RIT, artículos ni hechos que no estén en el contexto.
- Cuando cites documentos, usa relativePath (carpeta/archivo) del contexto.
- Si un documento aparece sin excerpt o con needs_ocr/pending, no inventes su contenido.
- Si falta información, dilo y propone qué dato pedir o revisar en LexOpen (p. ej. reintentar OCR).
- Etiqueta borradores como BORRADOR y marca [REVISAR] lo incierto.
- Plazos: el motor LexOpen es estimación interna, no cómputo oficial del tribunal.
- No sustituyas el criterio profesional ni presentes textos como listos para tribunal sin revisión humana.
${normalized.utilityHint ? `\nModo activo: ${normalized.utilityHint}` : ""}
${alerts}
${normalized.context ? `\nContexto anclado del estudio:\n${normalized.context}` : ""}`;
}
