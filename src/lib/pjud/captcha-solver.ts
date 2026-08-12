/**
 * Multi-provider image-CAPTCHA clients for OJV scrape (BYOK).
 * LexOpen es OSS gratis: el scrape live es opt-in; cada estudio trae su key.
 *
 * Proveedores:
 * - nopecha     → free tier ~100/día (IP residencial; key opcional)
 * - 2captcha    → pay-per-solve
 * - capsolver   → pay-per-solve (a veces créditos de prueba)
 * - anticaptcha → pay-per-solve
 * - capmonster  → CapMonster Cloud pay-per-solve
 */

export type CaptchaSolverProvider =
  | "nopecha"
  | "2captcha"
  | "capsolver"
  | "anticaptcha"
  | "capmonster";

export type CaptchaSolverProviderInfo = {
  id: CaptchaSolverProvider;
  label: string;
  freeTier: boolean;
  keyRequired: boolean;
  /** Short note for docs / UI */
  note: string;
  url: string;
};

/** Catálogo estable para UI, docs y validación de env. */
export const CAPTCHA_SOLVER_PROVIDERS: CaptchaSolverProviderInfo[] = [
  {
    id: "nopecha",
    label: "NopeCHA",
    freeTier: true,
    keyRequired: false,
    note: "Gratis ~100 solves/día en IP residencial. Key opcional (mejora cuota). No suele servir en VPS/datacenter.",
    url: "https://nopecha.com/",
  },
  {
    id: "2captcha",
    label: "2Captcha",
    freeTier: false,
    keyRequired: true,
    note: "Pay-per-solve humano. Depósito mínimo bajo; fiable para OJV.",
    url: "https://2captcha.com/",
  },
  {
    id: "capsolver",
    label: "CapSolver",
    freeTier: false,
    keyRequired: true,
    note: "Pay-per-solve AI; a veces créditos de prueba al registrarse.",
    url: "https://www.capsolver.com/",
  },
  {
    id: "anticaptcha",
    label: "Anti-Captcha",
    freeTier: false,
    keyRequired: true,
    note: "Pay-per-solve humano (ImageToText).",
    url: "https://anti-captcha.com/",
  },
  {
    id: "capmonster",
    label: "CapMonster Cloud",
    freeTier: false,
    keyRequired: true,
    note: "Pay-per-solve (API compatible ImageToText).",
    url: "https://capmonster.cloud/",
  },
];

export const CAPTCHA_SOLVER_PROVIDER_IDS = CAPTCHA_SOLVER_PROVIDERS.map(
  (p) => p.id
) as CaptchaSolverProvider[];

export class CaptchaSolverConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptchaSolverConfigError";
  }
}

export class CaptchaSolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptchaSolveError";
  }
}

export function isCaptchaSolverProvider(
  value: string | undefined | null
): value is CaptchaSolverProvider {
  return Boolean(
    value &&
      (CAPTCHA_SOLVER_PROVIDER_IDS as string[]).includes(value.toLowerCase())
  );
}

export function providerFromEnv(): CaptchaSolverProvider | undefined {
  const raw = process.env.CAPTCHA_SOLVER_PROVIDER?.trim().toLowerCase();
  if (!raw) return undefined;
  return isCaptchaSolverProvider(raw) ? raw : undefined;
}

export function apiKeyFromEnv() {
  const key = process.env.CAPTCHA_SOLVER_API_KEY?.trim();
  if (!key || key.toLowerCase() === "free" || key.toLowerCase() === "none") {
    return undefined;
  }
  return key;
}

export function getCaptchaSolverProviderInfo(
  id?: CaptchaSolverProvider
): CaptchaSolverProviderInfo | undefined {
  const pid = id || providerFromEnv();
  return CAPTCHA_SOLVER_PROVIDERS.find((p) => p.id === pid);
}

/** True si el provider elegido puede intentar solves (key o free-tier sin key). */
export function captchaSolverConfigured() {
  const provider = providerFromEnv();
  if (!provider) return false;
  const info = getCaptchaSolverProviderInfo(provider);
  if (!info) return false;
  if (info.keyRequired) return Boolean(apiKeyFromEnv());
  return true; // nopecha free-tier sin key
}

export function captchaSolverStatusPublic() {
  const provider = providerFromEnv();
  const info = getCaptchaSolverProviderInfo(provider);
  const key = Boolean(apiKeyFromEnv());
  return {
    configured: captchaSolverConfigured(),
    provider: provider || null,
    freeTier: Boolean(info?.freeTier),
    keyPresent: key,
    providers: CAPTCHA_SOLVER_PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      freeTier: p.freeTier,
      keyRequired: p.keyRequired,
      note: p.note,
      url: p.url,
    })),
  };
}

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = Number(process.env.CAPTCHA_SOLVE_TIMEOUT_MS ?? 120_000);

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeImageBase64(imageBase64: string) {
  const trimmed = imageBase64.trim();
  if (trimmed.startsWith("data:")) {
    const idx = trimmed.indexOf(",");
    return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
  }
  return trimmed;
}

function dataUrlPng(imageBase64: string) {
  const raw = normalizeImageBase64(imageBase64);
  return `data:image/png;base64,${raw}`;
}

async function solveWith2Captcha(
  imageBase64: string,
  apiKey: string,
  signal?: AbortSignal
) {
  const body = new URLSearchParams({
    key: apiKey,
    method: "base64",
    body: normalizeImageBase64(imageBase64),
    json: "1",
  });
  const submit = await fetch("https://2captcha.com/in.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal,
  });
  const submitJson = (await submit.json()) as { status: 0 | 1; request: string };
  if (submitJson.status !== 1) {
    throw new CaptchaSolveError(`2Captcha submit falló: ${submitJson.request}`);
  }
  const captchaId = submitJson.request;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const poll = await fetch(
      `https://2captcha.com/res.php?key=${encodeURIComponent(apiKey)}&action=get&id=${encodeURIComponent(captchaId)}&json=1`,
      { signal }
    );
    const pollJson = (await poll.json()) as { status: 0 | 1; request: string };
    if (pollJson.status === 1) return pollJson.request;
    if (pollJson.request !== "CAPCHA_NOT_READY") {
      throw new CaptchaSolveError(`2Captcha error: ${pollJson.request}`);
    }
  }
  throw new CaptchaSolveError(`2Captcha timeout (${POLL_TIMEOUT_MS}ms)`);
}

async function solveWithCapSolverStyle(
  label: string,
  endpointBase: string,
  imageBase64: string,
  apiKey: string,
  signal?: AbortSignal
) {
  const create = await fetch(`${endpointBase}/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey: apiKey,
      task: {
        type: "ImageToTextTask",
        body: normalizeImageBase64(imageBase64),
      },
    }),
    signal,
  });
  const createJson = (await create.json()) as {
    errorId: number;
    errorDescription?: string;
    errorCode?: string;
    taskId?: number | string;
  };
  if (createJson.errorId !== 0 || createJson.taskId == null) {
    throw new CaptchaSolveError(
      `${label} createTask falló: ${
        createJson.errorDescription ||
        createJson.errorCode ||
        createJson.errorId
      }`
    );
  }
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const poll = await fetch(`${endpointBase}/getTaskResult`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: apiKey, taskId: createJson.taskId }),
      signal,
    });
    const pollJson = (await poll.json()) as {
      errorId: number;
      errorDescription?: string;
      status: "processing" | "ready" | "failed";
      solution?: { text?: string; gRecaptchaResponse?: string };
    };
    if (pollJson.errorId !== 0) {
      throw new CaptchaSolveError(
        `${label} error: ${pollJson.errorDescription ?? pollJson.errorId}`
      );
    }
    if (pollJson.status === "ready" && pollJson.solution?.text) {
      return pollJson.solution.text;
    }
    if (pollJson.status === "failed") {
      throw new CaptchaSolveError(`${label} marcó la tarea como failed.`);
    }
  }
  throw new CaptchaSolveError(`${label} timeout (${POLL_TIMEOUT_MS}ms)`);
}

async function solveWithAntiCaptcha(
  imageBase64: string,
  apiKey: string,
  signal?: AbortSignal
) {
  return solveWithCapSolverStyle(
    "Anti-Captcha",
    "https://api.anti-captcha.com",
    imageBase64,
    apiKey,
    signal
  );
}

async function solveWithCapMonster(
  imageBase64: string,
  apiKey: string,
  signal?: AbortSignal
) {
  return solveWithCapSolverStyle(
    "CapMonster",
    "https://api.capmonster.cloud",
    imageBase64,
    apiKey,
    signal
  );
}

async function solveWithCapSolver(
  imageBase64: string,
  apiKey: string,
  signal?: AbortSignal
) {
  return solveWithCapSolverStyle(
    "CapSolver",
    "https://api.capsolver.com",
    imageBase64,
    apiKey,
    signal
  );
}

/**
 * NopeCHA textcaptcha. Key opcional = free tier por IP (~100/día, residencial).
 * @see https://developers.nopecha.com/recognition/textcaptcha/
 */
async function solveWithNopeCha(
  imageBase64: string,
  apiKey: string | undefined,
  signal?: AbortSignal
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Basic ${apiKey}`;
  }
  const body: Record<string, unknown> = {
    image_data: [dataUrlPng(imageBase64)],
  };
  if (apiKey) body.key = apiKey;

  const submit = await fetch(
    "https://api.nopecha.com/v1/recognition/textcaptcha",
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    }
  );
  const submitJson = (await submit.json().catch(() => ({}))) as {
    data?: string | string[];
    message?: string;
    error?: number | string;
    code?: number;
  };
  if (!submit.ok) {
    throw new CaptchaSolveError(
      `NopeCHA submit HTTP ${submit.status}: ${
        submitJson.message || JSON.stringify(submitJson)
      }`
    );
  }

  // Some responses return the answer inline as string[]; otherwise poll by job id.
  if (Array.isArray(submitJson.data) && typeof submitJson.data[0] === "string") {
    const answer = submitJson.data[0].trim();
    if (answer) return answer;
  }
  const jobId = typeof submitJson.data === "string" ? submitJson.data : null;
  if (!jobId) {
    throw new CaptchaSolveError(
      `NopeCHA submit sin job id: ${JSON.stringify(submitJson)}`
    );
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(Math.min(POLL_INTERVAL_MS, 1500));
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const url = new URL("https://api.nopecha.com/v1/recognition/textcaptcha");
    url.searchParams.set("id", jobId);
    if (apiKey) url.searchParams.set("key", apiKey);
    const poll = await fetch(url, { headers, signal });
    const pollJson = (await poll.json().catch(() => ({}))) as {
      data?: string[];
      message?: string;
      code?: number;
    };
    if (poll.status === 409) {
      // Incomplete job — keep polling
      continue;
    }
    if (!poll.ok) {
      throw new CaptchaSolveError(
        `NopeCHA poll HTTP ${poll.status}: ${
          pollJson.message || JSON.stringify(pollJson)
        }`
      );
    }
    const answer = Array.isArray(pollJson.data)
      ? String(pollJson.data[0] || "").trim()
      : "";
    if (answer) return answer;
  }
  throw new CaptchaSolveError(`NopeCHA timeout (${POLL_TIMEOUT_MS}ms)`);
}

export async function solveImageCaptcha(
  imageBase64: string,
  signal?: AbortSignal
) {
  const provider = providerFromEnv();
  const apiKey = apiKeyFromEnv();
  if (!provider) {
    throw new CaptchaSolverConfigError(
      `CAPTCHA_SOLVER_PROVIDER no configurado. Opciones: ${CAPTCHA_SOLVER_PROVIDER_IDS.join(
        " | "
      )}`
    );
  }
  const info = getCaptchaSolverProviderInfo(provider);
  if (info?.keyRequired && !apiKey) {
    throw new CaptchaSolverConfigError(
      `CAPTCHA_SOLVER_API_KEY requerido para provider=${provider}.`
    );
  }

  switch (provider) {
    case "nopecha":
      return solveWithNopeCha(imageBase64, apiKey, signal);
    case "2captcha":
      return solveWith2Captcha(imageBase64, apiKey!, signal);
    case "capsolver":
      return solveWithCapSolver(imageBase64, apiKey!, signal);
    case "anticaptcha":
      return solveWithAntiCaptcha(imageBase64, apiKey!, signal);
    case "capmonster":
      return solveWithCapMonster(imageBase64, apiKey!, signal);
    default: {
      const _exhaustive: never = provider;
      throw new CaptchaSolverConfigError(`Provider desconocido: ${_exhaustive}`);
    }
  }
}
