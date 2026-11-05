/** Digests and sizes of the exact Ollama registry manifests checked on 2026-11-05. */
export const LOCAL_MODELS = [
  {
    id: "qwen-small",
    name: "Qwen3 1.7B",
    tag: "qwen3:1.7b-q4_K_M",
    sha256: "8f68893c685c3ddff2aa3fffce2aa60a30bb2da65ca488b61fff134a4d1730e7",
    bytes: 1_359_293_444,
    download: "1,36 GB",
    task: "Resumir pasajes breves y extraer datos explícitos de un documento.",
    licenseUrl: null,
  },
  {
    id: "qwen-mini",
    name: "Qwen3 0.6B",
    tag: "qwen3:0.6b-q4_K_M",
    sha256: "7df6b6e09427a769808717c0a93cadc4ae99ed4eb8bf5ca557c90846becea435",
    bytes: 522_653_767,
    download: "523 MB",
    task: "Proponer etiquetas y clasificar texto corto para revisión.",
    licenseUrl: null,
  },
  {
    id: "gemma-small",
    name: "Gemma 3 1B",
    tag: "gemma3:1b-it-q4_K_M",
    sha256: "97558784bdc9175075a72655bf360b15da17df6b3b9e5182af9f8c0c8e58ba7c",
    bytes: 806_067_407,
    download: "806 MB",
    task: "Reescribir texto corto y organizar notas sencillas.",
    licenseUrl: "https://ai.google.dev/gemma/terms",
  },
] as const;

export type LocalModelProfile = (typeof LOCAL_MODELS)[number];
export type LocalModelId = LocalModelProfile["id"];
export const OLLAMA_LOCAL_ORIGIN = "http://127.0.0.1:11434";
export const OLLAMA_LOCAL_API = `${OLLAMA_LOCAL_ORIGIN}/v1`;
export const LOCAL_CONTEXT_TOKENS = 4096;
export const LOCAL_OUTPUT_TOKENS = 768;

export function localModelProfile(id: unknown) {
  return LOCAL_MODELS.find((model) => model.id === id);
}

export function configuredLocalModel(config: { preset: string; apiUrl: string; model: string; localProfile?: LocalModelId }) {
  const profile = localModelProfile(config.localProfile);
  if (profile && config.preset === "ollama" && config.apiUrl === OLLAMA_LOCAL_API && config.model === profile.tag) return profile;
  return undefined;
}
