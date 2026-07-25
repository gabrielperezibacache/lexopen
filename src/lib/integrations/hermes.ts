import { prisma } from "@/lib/db";

export type HermesConfig = {
  apiUrl: string;
  apiKey?: string;
  model: string;
  requireApproval: boolean;
  timeoutMs: number;
};

export type HermesSource = "hermes" | "demo" | "error";

export type HermesMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type HermesResult = {
  source: HermesSource;
  content: string;
  requireApproval: boolean;
  note?: string;
  error?: string;
  reachable: boolean;
};

function parseConfigJson(raw: string): Partial<HermesConfig> {
  try {
    return JSON.parse(raw) as Partial<HermesConfig>;
  } catch {
    return {};
  }
}

export async function getHermesConfig(): Promise<HermesConfig> {
  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "hermes" },
  });
  const defaults: HermesConfig = {
    apiUrl: (process.env.HERMES_API_URL || "http://localhost:8642/v1").replace(
      /\/$/,
      ""
    ),
    apiKey: process.env.HERMES_API_KEY || undefined,
    model: "hermes-legal",
    requireApproval: true,
    timeoutMs: Number(process.env.HERMES_TIMEOUT_MS || 45000),
  };
  if (!row) return defaults;
  const fromDb = parseConfigJson(row.configJson);
  return {
    ...defaults,
    ...fromDb,
    // Env wins for secrets/url in production deployments
    apiUrl: (process.env.HERMES_API_URL || fromDb.apiUrl || defaults.apiUrl).replace(
      /\/$/,
      ""
    ),
    apiKey: process.env.HERMES_API_KEY || fromDb.apiKey || defaults.apiKey,
  };
}

/** Demo only when explicitly allowed — never silent in production. */
export async function hermesDemoAllowed(): Promise<boolean> {
  if (process.env.HERMES_ALLOW_DEMO === "1") return true;
  if (process.env.HERMES_ALLOW_DEMO === "0") return false;
  if (process.env.NODE_ENV === "production") return false;
  try {
    const settings = await prisma.firmSettings.findFirst({
      select: { hermesAllowDemo: true },
    });
    if (settings) return settings.hermesAllowDemo;
  } catch {
    // ignore — table may be empty during early boot
  }
  return process.env.NODE_ENV === "development";
}

export function sanitizeHermesMessages(
  messages: HermesMessage[],
  maxMessages = 24,
  maxChars = 12000
): HermesMessage[] {
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
  const rest = cleaned.filter((m) => m.role !== "system").slice(-(maxMessages - system.length));
  return [...system, ...rest];
}

/**
 * Cliente OpenAI-compatible para Hermes Agent API server.
 * Fail-closed en producción salvo HERMES_ALLOW_DEMO=1.
 */
export async function askHermes(params: {
  messages: HermesMessage[];
  causaId?: string;
  userId?: string;
}): Promise<HermesResult> {
  const config = await getHermesConfig();
  const messages = sanitizeHermesMessages(params.messages);
  if (!messages.some((m) => m.role === "user")) {
    return {
      source: "error",
      content: "",
      requireApproval: true,
      reachable: false,
      note: "Prompt vacío: indique una instrucción para Hermes.",
      error: "empty_prompt",
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  try {
    const res = await fetch(`${config.apiUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(
        Number.isFinite(config.timeoutMs) ? config.timeoutMs : 45000
      ),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Hermes HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content =
      data.choices?.[0]?.message?.content?.trim() ||
      "Hermes no devolvió contenido.";

    if (params.causaId) {
      await prisma.activity.create({
        data: {
          tipo: "hermes",
          mensaje: `Hermes Agent: ${content.slice(0, 180)}${content.length > 180 ? "…" : ""}`,
          causaId: params.causaId,
          userId: params.userId,
        },
      });
    }

    return {
      source: "hermes",
      content,
      requireApproval: config.requireApproval,
      reachable: true,
    };
  } catch (err) {
    const allowDemo = await hermesDemoAllowed();
    const error = err instanceof Error ? err.message : "unreachable";
    if (!allowDemo) {
      return {
        source: "error",
        content: "",
        requireApproval: true,
        reachable: false,
        note:
          "Hermes Agent no está alcanzable. Modo demo deshabilitado (configure HERMES_ALLOW_DEMO=1 solo si acepta borradores locales).",
        error,
      };
    }
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const demo = buildDemoReply(lastUser?.content || "");
    if (params.causaId) {
      await prisma.activity.create({
        data: {
          tipo: "hermes",
          mensaje: `Hermes (modo local/demo): ${demo.slice(0, 180)}…`,
          causaId: params.causaId,
          userId: params.userId,
        },
      });
    }
    return {
      source: "demo",
      content: demo,
      requireApproval: true,
      reachable: false,
      note: "⚠ Modo demo: Hermes no alcanzable. Esta respuesta NO es del agente real.",
      error,
    };
  }
}

export function buildDemoReply(prompt: string) {
  return `## Análisis LexOpen × Hermes (demo)

**Consulta:** ${prompt.slice(0, 500) || "(vacía)"}

### Hallazgos preliminares
1. Identifique el **RIT/RUC**, tribunal y etapa procesal antes de redactar.
2. Cruce plazos fatales del Código de Procedimiento Civil / Código del Trabajo según materia.
3. Revise jurisprudencia vinculada en el módulo LexOpen (doctrina + roles).

### Borrador sugerido
- Exposición de hechos en orden cronológico.
- Fundamentos de derecho con citas de leyes chilenas aplicables.
- Petitorio claro y subsidiario.

> **Aprobación humana requerida:** no envíe ni presente este texto sin revisión del abogado responsable.
> **Fuente:** borrador local LexOpen (Hermes no conectado).
`;
}

export function legalSystemPrompt(context?: string) {
  return `Eres un asistente jurídico para un estudio de abogados en Chile, integrado en LexOpen (clon open-source inspirado en HighQ).
Responde en español chileno formal. No inventes sentencias; si no tienes certeza, indícalo.
Enfócate en: causas civiles, laborales, penales, familia y recursos constitucionales.
Nunca divulgues ni pidas datos de minutas marcadas como confidenciales fuera del contexto autorizado.
${context ? `\nContexto de la causa (filtrado por ACL):\n${context}` : ""}`;
}

export function statusLabel(source: HermesSource) {
  if (source === "hermes") return "Hermes Agent (real)";
  if (source === "demo") return "Demo local (no Hermes)";
  return "Error / no alcanzable";
}
