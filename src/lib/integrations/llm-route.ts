import type { LlmConfig } from "./llm";
import { LOCAL_MODELS } from "./local-model-profiles";

/** An Ícaro may choose a model, never a new endpoint or credentials. */
export type LlmRoute = { provider: "study" | "codex"; model: string };
export function isLlmRoute(value: unknown): value is LlmRoute {
  if (!value || typeof value !== "object") return false;
  const route = value as Partial<LlmRoute>;
  return (route.provider === "study" || route.provider === "codex") && typeof route.model === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$/.test(route.model);
}

export function studyLlmConfigForModel(config: LlmConfig, model: string): LlmConfig {
  if (!isLlmRoute({ provider: "study", model })) throw new Error("Seleccione un modelo válido para el Ícaro.");
  if (!config.localProfile) return { ...config, model };
  const profile = LOCAL_MODELS.find(item => item.tag === model);
  if (!profile) throw new Error("El Ícaro debe usar un modelo del catálogo local verificado.");
  return { ...config, model: profile.tag, localProfile: profile.id };
}
