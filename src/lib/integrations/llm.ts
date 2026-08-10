import { prisma } from "@/lib/db";

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

  let preset: LlmPreset = "custom";
  if (apiUrl.includes("api.openai.com")) preset = "openai";
  else if (apiUrl.includes("groq.com")) preset = "groq";
  else if (apiUrl.includes("11434")) preset = "ollama";
  else if (apiUrl.includes("8642") || apiUrl.includes("hermes"))
    preset = "hermes";
  else if (apiUrl.includes("azure") || apiUrl.includes("openai.azure"))
    preset = "azure";

  return {
    preset,
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

export async function getLlmConfig(): Promise<LlmConfig> {
  const defaults = defaultsFromEnv();
  const [row, firm] = await Promise.all([
    loadConfigRow(),
    prisma.firmSettings.findFirst({ select: { hermesAllowDemo: true } }),
  ]);
  const parsed = row
    ? (JSON.parse(row.configJson || "{}") as Partial<LlmConfig>)
    : {};
  const merged: LlmConfig = {
    ...defaults,
    ...parsed,
    apiKey:
      parsed.apiKey === "••••" || parsed.apiKey === ""
        ? defaults.apiKey
        : parsed.apiKey ?? defaults.apiKey,
  };
  // FirmSettings.hermesAllowDemo acts as study-wide override when LLM config
  // does not explicitly set allowDemo.
  if (parsed.allowDemo === undefined && firm) {
    merged.allowDemo = Boolean(firm.hermesAllowDemo);
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

export async function saveLlmConfig(input: {
  enabled?: boolean;
  config: Partial<LlmConfig>;
}) {
  const current = await getLlmConfig();
  let next: LlmConfig = { ...current, ...input.config };
  if (input.config.preset && input.config.preset !== "custom") {
    next = {
      ...next,
      ...applyPreset(input.config.preset, next),
      apiKey: input.config.apiKey ?? current.apiKey,
    };
  }
  if (input.config.apiKey === "••••" || input.config.apiKey === "") {
    next.apiKey = current.apiKey;
  }
  if (input.config.apiKey === null) {
    next.apiKey = undefined;
  }

  const payload = {
    preset: next.preset,
    apiUrl: next.apiUrl,
    apiKey: next.apiKey || "",
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

  // Keep hermes row in sync for legacy consumers
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

  return next;
}

export async function askLlm(params: {
  messages: LlmMessage[];
  causaId?: string;
  clienteId?: string;
  userId?: string;
  timeoutMs?: number;
}) {
  const config = await getLlmConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  try {
    const res = await fetch(`${config.apiUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: params.messages,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(params.timeoutMs || 30000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`LLM HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
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
          mensaje: `IA: ${content.slice(0, 180)}${content.length > 180 ? "…" : ""}`,
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
    const demo = buildDemoReply(lastUser?.content || "");
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
    timeoutMs: 15000,
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

function buildDemoReply(prompt: string) {
  return `## Análisis LexOpen × IA (demo)

**Consulta:** ${prompt.slice(0, 500) || "(vacía)"}

### Hallazgos preliminares
1. Identifique el **RIT/RUC**, tribunal y etapa procesal antes de redactar.
2. Cruce plazos fatales del Código de Procedimiento Civil / Código del Trabajo según materia.
3. Revise trámites pendientes y documentos de la carpeta del cliente.

### Borrador sugerido
- Exposición de hechos en orden cronológico.
- Fundamentos de derecho con citas de leyes chilenas aplicables.
- Petitorio claro y subsidiario.

> **Aprobación humana requerida:** no envíe ni presente este texto sin revisión del abogado responsable.
`;
}

export function legalSystemPrompt(context?: string) {
  return `Eres un asistente jurídico para un estudio de abogados en Chile, integrado en LexOpen (clon open-source inspirado en HighQ).
Responde en español chileno formal. No inventes sentencias; si no tienes certeza, indícalo.
Enfócate en: causas civiles, laborales, penales, familia y recursos constitucionales.
${context ? `\nContexto:\n${context}` : ""}`;
}
