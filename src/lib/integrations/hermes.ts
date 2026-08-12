/**
 * Compat layer: Hermes Agent → adaptador LLM multi-proveedor.
 * Preferir `@/lib/integrations/llm` en código nuevo.
 */
import {
  askLlm,
  getLlmConfig,
  legalSystemPrompt,
  type LlmMessage,
} from "@/lib/integrations/llm";

export type HermesConfig = {
  apiUrl: string;
  apiKey?: string;
  model: string;
  requireApproval: boolean;
};

export type HermesMessage = LlmMessage;

export async function getHermesConfig(): Promise<HermesConfig> {
  const cfg = await getLlmConfig();
  return {
    apiUrl: cfg.apiUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
    requireApproval: cfg.requireApproval,
  };
}

export async function askHermes(params: {
  messages: HermesMessage[];
  causaId?: string;
  userId?: string;
  utilityLabel?: string;
}) {
  const result = await askLlm(params);
  if (result.source === "llm") {
    return {
      source: "hermes" as const,
      content: result.content,
      requireApproval: result.requireApproval,
    };
  }
  if (result.source === "demo") {
    return {
      source: "demo" as const,
      content: result.content,
      requireApproval: result.requireApproval,
      note: result.note,
    };
  }
  return {
    source: "error" as const,
    content: result.content,
    requireApproval: result.requireApproval,
    note: result.note,
    error: "error" in result ? result.error : undefined,
  };
}

export { legalSystemPrompt };
