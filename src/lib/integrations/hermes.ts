import { prisma } from "@/lib/db";

export type HermesConfig = {
  apiUrl: string;
  apiKey?: string;
  model: string;
  requireApproval: boolean;
};

export async function getHermesConfig(): Promise<HermesConfig> {
  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "hermes" },
  });
  const defaults: HermesConfig = {
    apiUrl: process.env.HERMES_API_URL || "http://localhost:8642/v1",
    apiKey: process.env.HERMES_API_KEY || undefined,
    model: "hermes-legal",
    requireApproval: true,
  };
  if (!row) return defaults;
  return { ...defaults, ...(JSON.parse(row.configJson) as Partial<HermesConfig>) };
}

export type HermesMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Cliente OpenAI-compatible para Hermes Agent API server.
 * Si Hermes no está disponible, responde con un borrador local (modo demo).
 */
export async function askHermes(params: {
  messages: HermesMessage[];
  causaId?: string;
  userId?: string;
}) {
  const config = await getHermesConfig();
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
        messages: params.messages,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      throw new Error(`Hermes HTTP ${res.status}`);
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
      source: "hermes" as const,
      content,
      requireApproval: config.requireApproval,
    };
  } catch {
    const lastUser = [...params.messages].reverse().find((m) => m.role === "user");
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
      source: "demo" as const,
      content: demo,
      requireApproval: true,
      note: "Hermes Agent no está alcanzable. Se usó respuesta local de demostración. Configure HERMES_API_URL.",
    };
  }
}

function buildDemoReply(prompt: string) {
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
`;
}

export function legalSystemPrompt(context?: string) {
  return `Eres un asistente jurídico para un estudio de abogados en Chile, integrado en LexOpen (clon open-source inspirado en HighQ).
Responde en español chileno formal. No inventes sentencias; si no tienes certeza, indícalo.
Enfócate en: causas civiles, laborales, penales, familia y recursos constitucionales.
${context ? `\nContexto de la causa:\n${context}` : ""}`;
}
