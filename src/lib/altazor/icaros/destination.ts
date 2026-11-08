import { canonicalJson } from "@/lib/command-execution";
import { getAssistantFirmPolicy } from "@/lib/assistant/firm-policy";
import { getLlmConfig, llmEndpointHash } from "@/lib/integrations/llm";
import { studyLlmConfigForModel } from "@/lib/integrations/llm-route";
import { personalCodexPreference } from "@/lib/integrations/codex-preference";
import { codexDestinationFor } from "@/lib/integrations/codex-destination";
import { sha256 } from "@/lib/evidence/fragments";
import type { IcaroDestination, IcaroProvider } from "./types";

export async function icaroDestination(userId: string, profile: { provider: string; model: string; revision?: number }): Promise<IcaroDestination> {
  const [initial, preference, policy] = await Promise.all([getLlmConfig(), personalCodexPreference(userId), getAssistantFirmPolicy()]);
  const provider = profile.provider as IcaroProvider;
  const routeProvider: "study" | "codex" = provider === "codex" || provider === "inherit" && preference.enabled ? "codex" : "study";
  let model = profile.model || (routeProvider === "codex" ? preference.model : initial.model);
  let endpoint = "Proveedor sin configurar", endpointHash = "", remote = true, permitted = true;
  if (routeProvider === "codex") {
    const codex = await codexDestinationFor(userId, { ...preference, model });
    endpoint = codex.endpoint; endpointHash = codex.endpointHash; permitted = codex.permitted;
  } else {
    try {
      const config = studyLlmConfigForModel(initial, model);
      model = config.model; endpointHash = llmEndpointHash(config);
      const url = new URL(config.apiUrl);
      remote = !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
      endpoint = url.origin + url.pathname;
    } catch { permitted = false; }
  }
  const value = { routeProvider, provider: routeProvider === "codex" ? "codex" : initial.preset, model, endpoint, endpointHash, remote, permitted: permitted && Boolean(model) && (policy.assistantLlmMode !== "local_only" || !remote) };
  return { ...value, key: sha256(canonicalJson({ ...value, profileRevision: profile.revision ?? null })) };
}
