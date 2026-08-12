import { prisma } from "@/lib/db";
import { isSafeOutboundHttpUrl } from "@/lib/net/safe-url";
import { safeJsonParse } from "@/lib/safe-json";

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
  return {
    ...defaults,
    ...safeJsonParse<Partial<HermesConfig>>(row.configJson, {}),
  };
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
  utilityLabel?: string;
}) {
  const config = await getHermesConfig();
  let apiUrl: URL;
  try {
    apiUrl = new URL(config.apiUrl);
    // In development, localhost Hermes is intentional; block private hosts in production.
    const allowLocal =
      process.env.NODE_ENV !== "production" ||
      process.env.HERMES_ALLOW_PRIVATE_URL === "1";
    if (
      !isSafeOutboundHttpUrl(config.apiUrl, {
        allowHttp: allowLocal || process.env.NODE_ENV !== "production",
      }) &&
      !(
        allowLocal &&
        (apiUrl.hostname === "localhost" || apiUrl.hostname === "127.0.0.1")
      )
    ) {
      return {
        source: "error" as const,
        content: "",
        requireApproval: true,
        note: "La URL de Hermes no está permitida (SSRF / host privado).",
      };
    }
    if (
      (apiUrl.protocol !== "http:" && apiUrl.protocol !== "https:") ||
      apiUrl.username ||
      apiUrl.password
    ) {
      throw new Error("URL de Hermes inválida");
    }
  } catch {
    return {
      source: "error" as const,
      content: "",
      requireApproval: true,
      note: "La URL de Hermes no es válida.",
    };
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  try {
    const res = await fetch(`${apiUrl.toString().replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: params.messages,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(45_000),
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
  } catch (err) {
    const firm = await prisma.firmSettings.findFirst({
      select: { hermesAllowDemo: true },
    });
    const allowDemo =
      process.env.HERMES_ALLOW_DEMO === "1" ||
      process.env.NODE_ENV === "development" ||
      firm?.hermesAllowDemo === true;
    if (!allowDemo) {
      return {
        source: "error" as const,
        content: "",
        requireApproval: true,
        note:
          "Hermes Agent no está alcanzable. Modo demo deshabilitado (HERMES_ALLOW_DEMO≠1 / firm settings).",
        error: err instanceof Error ? err.message : "unreachable",
      };
    }
    const lastUser = [...params.messages].reverse().find((m) => m.role === "user");
    const demo = buildDemoReply(lastUser?.content || "", params.utilityLabel);
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
      note: "⚠ Modo demo: Hermes no alcanzable. Esta respuesta NO es del agente real.",
    };
  }
}

function buildDemoReply(prompt: string, utilityLabel?: string) {
  return `## Copiloto LexOpen (demo local)

**Modo:** ${utilityLabel || "copilot"}
**Consulta:** ${prompt.slice(0, 500) || "(vacía)"}

### Qué haría el asistente con Hermes conectado
1. Anclar la respuesta a la causa, carpeta investigativa (rutas), documentos indexados y plazos.
2. Citar fuentes locales con relativePath (movimientos, PDF extraídos, VDR, jurisprudencia).
3. Proponer un borrador o plan de trabajo etiquetado para revisión humana.

### Borrador sugerido
- Hechos en orden cronológico (solo con datos verificados del expediente LexOpen).
- Fundamentos con citas **del corpus disponible**; si faltan, marcar [REVISAR].
- Petitorio / próximos pasos operativos.

> **Aprobación humana requerida.** LexOpen no reemplaza el criterio del abogado ni fuentes oficiales.
`;
}

export function legalSystemPrompt(opts?: {
  context?: string;
  utilityHint?: string;
  alerts?: string[];
}) {
  const alerts =
    opts?.alerts?.length ?
      `\nAlertas operativas del host:\n${opts.alerts.map((a) => `- ${a}`).join("\n")}`
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
${opts?.utilityHint ? `\nModo activo: ${opts.utilityHint}` : ""}
${alerts}
${opts?.context ? `\nContexto anclado del estudio:\n${opts.context}` : ""}`;
}
