import os from "node:os";
import { statfs } from "node:fs/promises";
import { LOCAL_MODELS, type LocalModelId, type LocalModelProfile } from "./local-model-profiles";
import { collectLocalDevices, type LocalGpu } from "./local-model-device-probe";

const GIB = 1024 ** 3;
const MAX_INSTALLED_BYTES = 1024 ** 4;

export type LocalModelHardware = {
  platform: string;
  arch: string;
  cpuName: string;
  cpuCores: number;
  totalMemoryBytes: number;
  availableMemoryBytes: number;
  diskFreeBytes: number | null;
  scope: "host";
  gpu: "unknown" | "detected";
  gpus: LocalGpu[];
  memoryKind: "ram" | "unified";
  unifiedMemoryBytes: number | null;
  availableMemorySource: "os" | "meminfo" | "memory-pressure";
};

/** An observation boundary for deterministic recommendations, not a hardware benchmark. */
export type LocalModelHardwareProbe = {
  platform?: unknown;
  arch?: unknown;
  cpuName?: unknown;
  cpuCores?: unknown;
  totalMemoryBytes?: unknown;
  freeMemoryBytes?: unknown;
  availableMemoryBytes?: unknown;
  constrainedMemoryBytes?: unknown;
  diskFreeBytes?: unknown;
  gpus?: unknown;
  systemAvailableMemoryBytes?: unknown;
  availableMemorySource?: unknown;
};

export type LocalModelRecommendation = {
  candidateId: LocalModelId | null;
  capacityCandidateId: LocalModelId | null;
  basis: "ram" | "vram" | "unified";
  gpuName: string | null;
  availableMemoryKnown: boolean;
  downloadFits: boolean | null;
  reason: string;
  memoryBudgetBytes: number;
  memoryCapacityBytes: number;
  estimate: true;
};

export type InstalledLocalModel = { name: string; size: number; digest?: string };
export type LocalModelInventoryEntry = InstalledLocalModel & {
  catalogId?: LocalModelId;
  state: "verified" | "unmanaged";
};

function bytes(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function identifier(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,32}$/.test(value) ? value : "unknown";
}

function deviceName(value: unknown, fallback: string) {
  return typeof value === "string" ? value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").trim().slice(0, 160) || fallback : fallback;
}

function normalizeGpus(value: unknown): LocalGpu[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 16).flatMap((item: unknown): LocalGpu[] => {
    if (!item || typeof item !== "object") return [];
    const gpu = item as LocalGpu;
    if (!["system-profiler", "nvidia-smi", "linux-sysfs", "dxgi", "windows-cim"].includes(gpu.source)) return [];
    const total = bytes(gpu.totalMemoryBytes);
    const available = bytes(gpu.availableMemoryBytes);
    const totalMemoryBytes = total && total <= MAX_INSTALLED_BYTES ? total : null;
    return [{
      name: deviceName(gpu.name, "GPU sin identificar"),
      vendor: ["apple", "nvidia", "amd", "intel"].includes(gpu.vendor) ? gpu.vendor : "unknown",
      memoryKind: ["dedicated", "shared", "unified"].includes(gpu.memoryKind) ? gpu.memoryKind : "unknown",
      totalMemoryBytes,
      availableMemoryBytes: totalMemoryBytes && available !== undefined && available <= totalMemoryBytes ? available : null,
      source: gpu.source,
    }];
  });
}

export function normalizeLocalModelHardware(probe: LocalModelHardwareProbe): LocalModelHardware {
  const total = bytes(probe.totalMemoryBytes) ?? 0;
  const constraint = bytes(probe.constrainedMemoryBytes) ?? 0;
  const totalMemoryBytes = constraint > 0 ? Math.min(total || constraint, constraint) : total;
  const free = bytes(probe.freeMemoryBytes);
  const available = bytes(probe.availableMemoryBytes);
  const observations = [free, available].filter((value): value is number => value !== undefined);
  const nativeAvailable = bytes(probe.systemAvailableMemoryBytes);
  const nativeSource = probe.availableMemorySource === "meminfo" || probe.availableMemorySource === "memory-pressure" ? probe.availableMemorySource : null;
  // Native availability includes reclaimable pages. A process/container limit still takes precedence.
  const availableMemoryBytes = nativeSource && nativeAvailable !== undefined
    ? Math.min(totalMemoryBytes, nativeAvailable, ...(constraint > 0 && available !== undefined ? [available] : []))
    : Math.min(totalMemoryBytes, ...(observations.length ? observations : [0]));
  const cpuName = deviceName(probe.cpuName, "No identificado");
  const gpus = normalizeGpus(probe.gpus);
  const unified = probe.platform === "darwin" && (/^Apple\s+[MA]\d/i.test(cpuName) || gpus.some(gpu => gpu.vendor === "apple" && gpu.memoryKind === "unified"));
  for (const gpu of gpus) {
    if (gpu.memoryKind !== "unified") continue;
    if (unified && gpu.vendor === "apple") {
      gpu.totalMemoryBytes = totalMemoryBytes || null;
      gpu.availableMemoryBytes = totalMemoryBytes ? availableMemoryBytes : null;
    } else { gpu.memoryKind = "shared"; gpu.totalMemoryBytes = null; gpu.availableMemoryBytes = null; }
  }
  return {
    platform: identifier(probe.platform),
    arch: identifier(probe.arch),
    cpuName,
    cpuCores: typeof probe.cpuCores === "number" && Number.isInteger(probe.cpuCores) && probe.cpuCores > 0 ? Math.min(probe.cpuCores, 4096) : 1,
    totalMemoryBytes,
    availableMemoryBytes,
    diskFreeBytes: bytes(probe.diskFreeBytes) ?? null,
    scope: "host",
    gpu: gpus.length ? "detected" : "unknown",
    gpus,
    memoryKind: unified ? "unified" : "ram",
    unifiedMemoryBytes: unified && totalMemoryBytes ? totalMemoryBytes : null,
    availableMemorySource: nativeSource && nativeAvailable !== undefined ? nativeSource : "os",
  };
}

function observe<T>(read: () => T): T | undefined {
  try { return read(); } catch { return undefined; }
}

/** No path is accepted from the browser; the free-disk reading is only a reference. */
export async function collectLocalModelHardware(signal?: AbortSignal): Promise<LocalModelHardware> {
  signal?.throwIfAborted();
  const cpus = observe(() => os.cpus());
  const processMemory = process as typeof process & { availableMemory?: () => number; constrainedMemory?: () => number };
  const [devices, diskFreeBytes] = await Promise.all([
    collectLocalDevices(process.platform, observe(() => os.totalmem()) ?? 0, signal),
    (async (): Promise<number | null> => {
      try {
        const disk = await statfs(os.homedir(), { bigint: true });
        const free = disk.bavail * disk.bsize;
        return free >= BigInt(0) ? Number(free > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : free) : null;
      } catch { return null; /* The runtime may use another volume; do not invent a capacity. */ }
    })(),
  ]);
  return normalizeLocalModelHardware({
    platform: process.platform,
    arch: process.arch,
    cpuName: cpus?.[0]?.model,
    cpuCores: observe(() => os.availableParallelism()) ?? cpus?.length,
    totalMemoryBytes: observe(() => os.totalmem()),
    freeMemoryBytes: observe(() => os.freemem()),
    availableMemoryBytes: observe(() => processMemory.availableMemory?.()),
    constrainedMemoryBytes: observe(() => processMemory.constrainedMemory?.()),
    diskFreeBytes,
    ...devices,
  });
}

/** Preserve only bounded model metadata; never inspect runtime files or execute a tag. */
export function sanitizeInstalledLocalModels(records: readonly unknown[]): InstalledLocalModel[] {
  const result: InstalledLocalModel[] = [];
  for (const record of records.slice(0, 1000)) {
    if (!record || typeof record !== "object") continue;
    const value = record as Record<string, unknown>;
    if (typeof value.name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(value.name)) continue;
    const size = bytes(value.size);
    if (size === undefined || size < 1 || size > MAX_INSTALLED_BYTES) continue;
    const validDigest = typeof value.digest === "string" && /^(?:sha256:)?[a-fA-F0-9]{64}$/.test(value.digest)
      ? `sha256:${value.digest.replace(/^sha256:/, "").toLowerCase()}` : undefined;
    result.push({ name: value.name, size, ...(validDigest ? { digest: validDigest } : {}) });
  }
  return result;
}

function matches(profile: LocalModelProfile, model: InstalledLocalModel) {
  return model.digest === `sha256:${profile.sha256}` && model.size === profile.bytes;
}

export function canonicalLocalModelState(profile: LocalModelProfile, models: readonly InstalledLocalModel[]): "ready" | "missing" | "different" {
  const canonical = models.filter(model => model.name.toLowerCase() === profile.tag.toLowerCase());
  return canonical.length === 0 ? "missing" : canonical.every(model => matches(profile, model)) ? "ready" : "different";
}

export function localModelInventory(models: readonly InstalledLocalModel[]) {
  const entries: LocalModelInventoryEntry[] = models.slice(0, 100).map(model => {
    const profile = LOCAL_MODELS.find(candidate => matches(candidate, model));
    return { ...model, ...(profile ? { catalogId: profile.id } : {}), state: profile ? "verified" : "unmanaged" };
  });
  return { installed: entries, installedCount: models.length, installedLimited: models.length > entries.length };
}

// Editorial ordering for document review, not a measured Spanish legal benchmark.
const DOCUMENT_RANK: Record<LocalModelId, number> = {
  "qwen-mini": 10, "gemma-small": 12, "qwen-small": 20, "qwen35-2b": 30,
  "phi4-mini": 40, "qwen35-4b": 50, "gemma4-e2b": 50, "qwen35-9b": 65,
  "gemma4-e4b": 64, "gemma4-12b": 75, "gpt-oss-20b": 70, "gemma4-26b": 85,
  "qwen38-27b": 90, "gemma4-31b": 88, "qwen36-35b": 86, "gpt-oss-120b": 92,
};

/** One physical pool per route: never add RAM to VRAM or combine multiple GPUs. */
export function localModelRecommendation(hardware: LocalModelHardware, installedCatalogIds: readonly LocalModelId[] = []): LocalModelRecommendation {
  const installed = new Set(installedCatalogIds);
  const unified = hardware.memoryKind === "unified";
  const reserve = unified ? Math.max(3 * GIB, Math.min(8 * GIB, hardware.totalMemoryBytes * .15)) : Math.min(3 * GIB, hardware.totalMemoryBytes * .25);
  const hostBudget = Math.max(0, hardware.availableMemoryBytes - reserve);
  type Route = { basis: LocalModelRecommendation["basis"]; total: number; budget: number; capacityBudget: number; gpu: LocalGpu | null; known: boolean };
  const routes: Route[] = [{ basis: unified ? "unified" : "ram", total: hardware.totalMemoryBytes, budget: unified ? Math.min(hostBudget, hardware.totalMemoryBytes * .75) : hostBudget, capacityBudget: unified ? Math.min(hardware.totalMemoryBytes - reserve, hardware.totalMemoryBytes * .75) : Math.max(0, hardware.totalMemoryBytes - reserve), gpu: null, known: true }];
  if (!unified) for (const gpu of hardware.gpus ?? []) {
    if (gpu.memoryKind !== "dedicated" || !gpu.totalMemoryBytes) continue;
    const gpuReserve = Math.max(.5 * GIB, gpu.totalMemoryBytes * .05);
    routes.push({ basis: "vram", total: gpu.totalMemoryBytes, budget: gpu.availableMemoryBytes === null ? gpu.totalMemoryBytes * .8 : Math.max(0, gpu.availableMemoryBytes - gpuReserve), capacityBudget: Math.max(0, gpu.totalMemoryBytes - gpuReserve), gpu, known: gpu.availableMemoryBytes !== null });
  }
  function choose(capacityOnly: boolean) {
    return routes.flatMap(route => LOCAL_MODELS.flatMap(profile => {
      const required = route.basis === "vram" ? profile.memory.vram * GIB * .85 : profile.workingMemoryGiB * GIB;
      const hostFits = route.basis !== "vram" || hardware.totalMemoryBytes >= Math.min(profile.memory.ram, 8) * GIB && (capacityOnly ? hardware.totalMemoryBytes - reserve : hostBudget) >= Math.min(2, profile.workingMemoryGiB) * GIB;
      if (!hostFits || profile.memory[route.basis] * GIB > route.total || required > (capacityOnly ? route.capacityBudget : route.budget)) return [];
      const score = DOCUMENT_RANK[profile.id] + (route.basis !== "ram" ? 12 : 0)
        - (route.basis === "ram" && profile.workingMemoryGiB > 12 ? 60 : 0)
        - (profile.workingMemoryGiB > 32 ? 12 : 0);
      return [{ profile, route, score }];
    })).sort((a, b) => b.score - a.score || Number(installed.has(b.profile.id)) - Number(installed.has(a.profile.id)) || a.profile.bytes - b.profile.bytes)[0];
  }
  const current = choose(false), capacity = choose(true);
  const selected = current ?? capacity;
  const candidate = current?.profile;
  const route = selected?.route ?? routes[0];
  let reason: string;
  if (!hardware.totalMemoryBytes) reason = "No se pudo comprobar la memoria del equipo que aloja LexOpen. Vuelve a detectar el equipo.";
  else if (!candidate) reason = capacity ? "La capacidad total permite este modelo, pero falta memoria libre ahora. Cierra otras aplicaciones y vuelve a detectar antes de usarlo." : "El margen de memoria es demasiado reducido para recomendar un modelo del catálogo. Puedes seguir comparando las opciones.";
  else reason = `Orientación para revisar documentos según ${route.basis === "unified" ? "la memoria unificada" : route.basis === "vram" ? `la VRAM de ${route.gpu?.name}` : "la RAM"} y el margen disponible. Se reserva memoria para el sistema y el contexto.`;
  if (route.basis === "vram") reason += route.known ? " La ejecución acelerada depende de la compatibilidad del motor con esta GPU." : " No se pudo medir la VRAM libre; se aplica un margen del 20 % y la recomendación queda condicionada a la memoria y compatibilidad del motor.";
  if (route.basis === "ram" && hardware.gpu === "unknown") reason += " GPU sin comprobar; se utiliza una estimación en CPU.";
  if (candidate && installed.has(candidate.id)) reason += " Esta edición ya está instalada y verificada.";
  const downloadFits = candidate && hardware.diskFreeBytes !== null ? hardware.diskFreeBytes >= Math.ceil(candidate.bytes * 2) + .5 * GIB : null;
  if (downloadFits === false && candidate && !installed.has(candidate.id)) reason += " El disco de referencia tiene poco margen para prepararlo más adelante.";
  return { candidateId: hardware.totalMemoryBytes ? candidate?.id ?? null : null, capacityCandidateId: hardware.totalMemoryBytes ? capacity?.profile.id ?? null : null, basis: route.basis, gpuName: route.gpu?.name ?? null, availableMemoryKnown: route.known, downloadFits, reason, memoryBudgetBytes: Math.floor(route.budget), memoryCapacityBytes: route.total, estimate: true };
}
