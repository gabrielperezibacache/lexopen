import { prisma } from "@/lib/db";
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
    throw new Error("URL de endpoint IA no permitida (SSRF / host privado)");
  }

  const payload = {
    preset: next.preset,
    apiUrl: next.apiUrl.replace(/\/+$/, ""),
    apiKey: next.apiKey ? encryptSecret(next.apiKey) : "",
    model: next.model,
    requireApproval: next.requireApproval,
    allowDemo: next.allowDemo,
  };

  await prisma.integrationConfig.upsert({
    where: { provider: "llm" },
    create: {
      provider: "llm",
      enabled: Boolean(input.enabled ?? true),
      configJson: JSON.stringify(payload),
    },
    update: {
      enabled: Boolean(input.enabled ?? true),
      configJson: JSON.stringify(payload),
    },
  });

  // Keep hermes row in sync for legacy consumers / copiloto
  await prisma.integrationConfig.upsert({
    where: { provider: "hermes" },
    create: {
      provider: "hermes",
      enabled: Boolean(input.enabled ?? true),
      configJson: JSON.stringify({
        apiUrl: payload.apiUrl,
        apiKey: payload.apiKey,
        model: payload.model,
        requireApproval: payload.requireApproval,
      }),
    },
    update: {
      enabled: Boolean(input.enabled ?? true),
      configJson: JSON.stringify({
        apiUrl: payload.apiUrl,
        apiKey: payload.apiKey,
        model: payload.model,
        requireApproval: payload.requireApproval,
      }),
    },
  });

  return { ...next, apiUrl: payload.apiUrl };
}

export async function askLlm(params: {
  messages: LlmMessage[];
  causaId?: string;
  userId?: string;
  utilityLabel?: string;
  timeoutMs?: number;
}) {
  const config = await getLlmConfig();
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
        note: "La URL del proveedor IA no está permitida (SSRF / host privado).",
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
      note: "La URL del proveedor IA no es válida.",
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
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
        messages: params.messages,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(params.timeoutMs || 45_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `LLM HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content =
      data.choices?.[0]?.message?.content?.trim() ||
      "El proveedor no devolvió contenido.";

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
    if (!config.allowDemo) {
      return {
        source: "error" as const,
        content: "",
        requireApproval: true,
        provider: config.preset,
        model: config.model,
        note:
          "Proveedor IA no alcanzable. Active allowDemo en Configuración o revise endpoint/API key.",
        error: err instanceof Error ? err.message : "unreachable",
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
