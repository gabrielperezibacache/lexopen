/** Preview .env lines that follow the form (never includes the raw API key). */
export function llmEnvSnippet(config: {
  apiUrl?: string;
  model?: string;
  allowDemo?: boolean;
  hasApiKey?: boolean;
  apiKey?: string;
}) {
  const url =
    (config.apiUrl || "").replace(/\/+$/, "") || "https://api.openai.com/v1";
  const model = config.model?.trim() || "gpt-4o-mini";
  const keySet = Boolean(
    config.hasApiKey ||
      (config.apiKey && config.apiKey !== "••••" && config.apiKey.trim())
  );
  return [
    `LLM_API_URL=${url}`,
    `LLM_API_KEY=${keySet ? "••••" : ""}`,
    `LLM_MODEL=${model}`,
    `LLM_ALLOW_DEMO=${config.allowDemo ? "1" : "0"}`,
    "# Compat: HERMES_API_URL / HERMES_API_KEY / HERMES_ALLOW_DEMO",
  ].join("\n");
}
