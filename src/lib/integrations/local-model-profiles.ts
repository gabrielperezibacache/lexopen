/** Exact Ollama registry manifests verified on 2026-11-07; no model weights were downloaded.
 * Memory figures are planning estimates for one text request at 4,096 tokens, not benchmarks.
 * RAM/unified figures include room for the system; VRAM figures assume compatible GPU support.
 */
export const LOCAL_MODELS_VERIFIED_ON = "2026-11-07";
export const LOCAL_MODELS = [
  {
    "id": "qwen-small",
    "name": "Qwen3 1.7B",
    "tag": "qwen3:1.7b-q4_K_M",
    "sha256": "8f68893c685c3ddff2aa3fffce2aa60a30bb2da65ca488b61fff134a4d1730e7",
    "bytes": 1359293444,
    "download": "1,36 GB",
    "memory": {
      "ram": 8,
      "vram": 4,
      "unified": 8
    },
    "workingMemoryGiB": 3.5,
    "valueRank": 40,
    "thinking": "toggle",
    "summary": "Ligero para equipos de 8 GB; conserva compatibilidad con la edición anterior.",
    "licenseUrl": null
  },
  {
    "id": "qwen-mini",
    "name": "Qwen3 0.6B",
    "tag": "qwen3:0.6b-q4_K_M",
    "sha256": "7df6b6e09427a769808717c0a93cadc4ae99ed4eb8bf5ca557c90846becea435",
    "bytes": 522653767,
    "download": "523 MB",
    "memory": {
      "ram": 4,
      "vram": 2,
      "unified": 4
    },
    "workingMemoryGiB": 1.75,
    "valueRank": 10,
    "thinking": "toggle",
    "summary": "La descarga y el consumo más bajos del catálogo; capacidad limitada.",
    "licenseUrl": null
  },
  {
    "id": "gemma-small",
    "name": "Gemma 3 1B",
    "tag": "gemma3:1b-it-q4_K_M",
    "sha256": "97558784bdc9175075a72655bf360b15da17df6b3b9e5182af9f8c0c8e58ba7c",
    "bytes": 806067407,
    "download": "806 MB",
    "memory": {
      "ram": 6,
      "vram": 2,
      "unified": 6
    },
    "workingMemoryGiB": 2.5,
    "valueRank": 20,
    "thinking": "none",
    "summary": "Alternativa pequeña cuando el margen de memoria es reducido.",
    "licenseUrl": "https://ai.google.dev/gemma/terms"
  },
  {
    "id": "qwen35-2b",
    "name": "Qwen3.5 2B",
    "tag": "qwen3.5:2b-q4_K_M",
    "sha256": "1e2d21a4f03ab9e4a9c1976a4b7e88f21de61d65f2c5485d8fde8942be73f1e7",
    "bytes": 1945781358,
    "download": "1,95 GB",
    "memory": {
      "ram": 8,
      "vram": 4,
      "unified": 8
    },
    "workingMemoryGiB": 4,
    "valueRank": 60,
    "thinking": "toggle",
    "summary": "Punto de entrada económico de la familia Qwen3.5 para aprovechar un equipo de 8 GB.",
    "licenseUrl": null
  },
  {
    "id": "phi4-mini",
    "name": "Phi-4 mini 3.8B",
    "tag": "phi4-mini:3.8b-q4_K_M",
    "sha256": "78fad5d182a7c33065e153a5f8ba210754207ba9d91973f57dffa7f487363753",
    "bytes": 2491876774,
    "download": "2,49 GB",
    "memory": {
      "ram": 12,
      "vram": 6,
      "unified": 12
    },
    "workingMemoryGiB": 5,
    "valueRank": 55,
    "thinking": "none",
    "summary": "Alternativa compacta de Microsoft con una descarga de unos 2,5 GB.",
    "licenseUrl": null
  },
  {
    "id": "qwen35-4b",
    "name": "Qwen3.5 4B",
    "tag": "qwen3.5:4b-q4_K_M",
    "sha256": "d8b0f5e9760cd1682034f292d7ef72ec46f432149be0df7574bf2d6e92e38c04",
    "bytes": 3324173934,
    "download": "3,32 GB",
    "memory": {
      "ram": 12,
      "vram": 6,
      "unified": 12
    },
    "workingMemoryGiB": 6,
    "valueRank": 80,
    "thinking": "toggle",
    "summary": "Primera opción de bajo consumo para comparar en equipos de 12–16 GB.",
    "licenseUrl": null
  },
  {
    "id": "gemma4-e2b",
    "name": "Gemma 4 E2B",
    "tag": "gemma4:e2b-it-q4_K_M",
    "sha256": "b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2",
    "bytes": 4587156505,
    "download": "4,59 GB",
    "memory": {
      "ram": 12,
      "vram": 8,
      "unified": 12
    },
    "workingMemoryGiB": 7,
    "valueRank": 65,
    "thinking": "toggle",
    "summary": "Alternativa de Google; E2B indica parámetros efectivos, no el tamaño completo en memoria.",
    "licenseUrl": null
  },
  {
    "id": "qwen35-9b",
    "name": "Qwen3.5 9B",
    "tag": "qwen3.5:9b-q4_K_M",
    "sha256": "56671c2ab9385f9cfcb404638e32cd62d88e3501d44822208363c010179a3c90",
    "bytes": 6550825550,
    "download": "6,55 GB",
    "memory": {
      "ram": 16,
      "vram": 10,
      "unified": 16
    },
    "workingMemoryGiB": 10,
    "valueRank": 90,
    "thinking": "toggle",
    "summary": "Paso intermedio si ya dispones de 16–24 GB y puedes dedicar más memoria al modelo.",
    "licenseUrl": null
  },
  {
    "id": "gemma4-e4b",
    "name": "Gemma 4 E4B",
    "tag": "gemma4:e4b-it-q4_K_M",
    "sha256": "dc35e8d9c6061baa6f0fa870975ab6932e2542b579b13ea0f199fa4bb7300c9c",
    "bytes": 6583656505,
    "download": "6,58 GB",
    "memory": {
      "ram": 16,
      "vram": 10,
      "unified": 16
    },
    "workingMemoryGiB": 10,
    "valueRank": 85,
    "thinking": "toggle",
    "summary": "Alternativa a Qwen3.5 9B con una descarga similar; compara respuestas antes de elegir.",
    "licenseUrl": null
  },
  {
    "id": "gemma4-12b",
    "name": "Gemma 4 12B",
    "tag": "gemma4:12b-it-q4_K_M",
    "sha256": "6114515d63c17436a7c0417d82820ac65ad643e2806c5a3c89cb62846436ed0b",
    "bytes": 8021618941,
    "download": "8,02 GB",
    "memory": {
      "ram": 24,
      "vram": 12,
      "unified": 24
    },
    "workingMemoryGiB": 12,
    "valueRank": 95,
    "thinking": "toggle",
    "summary": "Escalón para equipos de 24 GB; permite aprovechar una GPU de 12 GB con contexto corto.",
    "licenseUrl": null
  },
  {
    "id": "gpt-oss-20b",
    "name": "gpt-oss 20B",
    "tag": "gpt-oss:20b",
    "sha256": "f38aa0c53da5f8c49d08c43a99df24ff53167fe68e24664a7777288e7656fdfe",
    "bytes": 13793441566,
    "download": "13,79 GB",
    "memory": {
      "ram": 24,
      "vram": 16,
      "unified": 24
    },
    "workingMemoryGiB": 15,
    "valueRank": 88,
    "thinking": "level",
    "summary": "Cuantización MXFP4 y expertos dispersos; alternativa si ya tienes 16 GB de VRAM o 24 GB unificados.",
    "licenseUrl": null
  },
  {
    "id": "gemma4-26b",
    "name": "Gemma 4 26B A4B",
    "tag": "gemma4:26b-a4b-it-qat",
    "sha256": "2dd70431afed94dd3688d790443768c1487ed086b57147ff083851116ae4c4e4",
    "bytes": 15634199946,
    "download": "15,63 GB",
    "memory": {
      "ram": 32,
      "vram": 24,
      "unified": 32
    },
    "workingMemoryGiB": 20,
    "valueRank": 84,
    "thinking": "toggle",
    "summary": "Edición QAT de menor tamaño; activa 4B parámetros, pero carga los pesos de 26B.",
    "licenseUrl": null
  },
  {
    "id": "qwen38-27b",
    "name": "Qwen3.8 27B",
    "tag": "qwen3.8:27b-q4_K_M",
    "sha256": "25b843619e944cd0ae6069f94ff4e5e26a16e109ccbc0a66a0f05979ed70098e",
    "bytes": 17741872132,
    "download": "17,74 GB",
    "memory": {
      "ram": 32,
      "vram": 24,
      "unified": 32
    },
    "workingMemoryGiB": 22,
    "valueRank": 83,
    "thinking": "toggle",
    "summary": "Opción reciente para comparar si tu equipo ya tiene 32 GB o una GPU de 24 GB.",
    "licenseUrl": null
  },
  {
    "id": "gemma4-31b",
    "name": "Gemma 4 31B",
    "tag": "gemma4:31b-it-q4_K_M",
    "sha256": "17ba34c06c801ba22f6047bab21ced9429c6d43e0e42ecf339b0f3e5a61e8d97",
    "bytes": 20385458234,
    "download": "20,39 GB",
    "memory": {
      "ram": 48,
      "vram": 32,
      "unified": 48
    },
    "workingMemoryGiB": 26,
    "valueRank": 75,
    "thinking": "toggle",
    "summary": "Mayor consumo; aprovecha equipos de 48–64 GB antes de plantearte ampliar hardware.",
    "licenseUrl": null
  },
  {
    "id": "qwen36-35b",
    "name": "Qwen3.6 35B A3B",
    "tag": "qwen3.6:35b-a3b-q4_K_M",
    "sha256": "07d35212591fc27746f0a317c975a6d68754fb38e9053d82e25f06057af28522",
    "bytes": 23938333577,
    "download": "23,94 GB",
    "memory": {
      "ram": 48,
      "vram": 32,
      "unified": 48
    },
    "workingMemoryGiB": 28,
    "valueRank": 74,
    "thinking": "toggle",
    "summary": "Modelo de expertos: activa unos 3B parámetros, pero necesita cargar los pesos de 35B.",
    "licenseUrl": null
  },
  {
    "id": "gpt-oss-120b",
    "name": "gpt-oss 120B",
    "tag": "gpt-oss:120b",
    "sha256": "714d86958b6e870a9320e78126ac1ce3477727a1cd9bf7194b8ace0d84c62fd8",
    "bytes": 65369819583,
    "download": "65,37 GB",
    "memory": {
      "ram": 96,
      "vram": 80,
      "unified": 96
    },
    "workingMemoryGiB": 76,
    "valueRank": 30,
    "thinking": "level",
    "summary": "Referencia para equipos de 96–128 GB ya disponibles; no es la primera opción para ahorrar.",
    "licenseUrl": null
  }
] as const;

export type LocalModelProfile = (typeof LOCAL_MODELS)[number];
export type LocalModelId = LocalModelProfile["id"];
export type LocalMemoryKind = "ram" | "vram" | "unified";
export const LOCAL_MEMORY_CAPACITIES = [4, 6, 8, 12, 16, 24, 32, 48, 64, 80, 96, 128] as const;
export const LOCAL_MODELS_BY_MEMORY = [...LOCAL_MODELS].sort((a, b) => a.memory.ram - b.memory.ram || a.bytes - b.bytes);
export const OLLAMA_LOCAL_ORIGIN = "http://127.0.0.1:11434";
export const OLLAMA_LOCAL_API = `${OLLAMA_LOCAL_ORIGIN}/v1`;
export const LOCAL_CONTEXT_TOKENS = 4096;
export const LOCAL_OUTPUT_TOKENS = 768;

export function localModelProfile(id: unknown) {
  return LOCAL_MODELS.find((model) => model.id === id);
}

export function localModelsForMemory(kind: LocalMemoryKind, capacityGiB: number) {
  if (!Number.isFinite(capacityGiB) || capacityGiB <= 0) return [];
  return LOCAL_MODELS_BY_MEMORY.filter(model => model.memory[kind] <= capacityGiB);
}

export function localModelSource(profile: LocalModelProfile) {
  return `https://ollama.com/library/${profile.tag}`;
}

export function configuredLocalModel(config: { preset: string; apiUrl: string; model: string; localProfile?: LocalModelId }) {
  const profile = localModelProfile(config.localProfile);
  if (profile && config.preset === "ollama" && config.apiUrl === OLLAMA_LOCAL_API && config.model === profile.tag) return profile;
  return undefined;
}
