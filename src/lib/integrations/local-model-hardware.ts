import os from "node:os";
import { statfs } from "node:fs/promises";
import { LOCAL_MODELS, type LocalModelId, type LocalModelProfile } from "./local-model-profiles";

const GIB = 1024 ** 3;
const MAX_INSTALLED_BYTES = 1024 ** 4;
const RESERVED_MEMORY_BYTES = Math.ceil(1.5 * GIB);

export type LocalModelHardware = {
  platform: string;
  arch: string;
  cpuName: string;
  cpuCores: number;
  totalMemoryBytes: number;
  availableMemoryBytes: number;
  diskFreeBytes: number | null;
  scope: "host";
  gpu: "unknown";
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
};

export type LocalModelRecommendation = {
  purpose: "documents" | "writing" | "browser";
  candidateId: LocalModelId | null;
  reason: string;
  memoryBudgetBytes: number;
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

export function normalizeLocalModelHardware(probe: LocalModelHardwareProbe): LocalModelHardware {
  const total = bytes(probe.totalMemoryBytes) ?? 0;
  const constraint = bytes(probe.constrainedMemoryBytes) ?? 0;
  const totalMemoryBytes = constraint > 0 ? Math.min(total || constraint, constraint) : total;
  const free = bytes(probe.freeMemoryBytes);
  const available = bytes(probe.availableMemoryBytes);
  const observations = [free, available].filter((value): value is number => value !== undefined);
  const availableMemoryBytes = Math.min(totalMemoryBytes, ...(observations.length ? observations : [0]));
  const cpuName = typeof probe.cpuName === "string"
    ? probe.cpuName.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").trim().slice(0, 160) : "";
  return {
    platform: identifier(probe.platform),
    arch: identifier(probe.arch),
    cpuName: cpuName || "No identificado",
    cpuCores: typeof probe.cpuCores === "number" && Number.isInteger(probe.cpuCores) && probe.cpuCores > 0 ? Math.min(probe.cpuCores, 4096) : 1,
    totalMemoryBytes,
    availableMemoryBytes,
    diskFreeBytes: bytes(probe.diskFreeBytes) ?? null,
    scope: "host",
    gpu: "unknown",
  };
}

function observe<T>(read: () => T): T | undefined {
  try { return read(); } catch { return undefined; }
}

/** No path is accepted from the browser; the free-disk reading is only a reference. */
export async function collectLocalModelHardware(): Promise<LocalModelHardware> {
  const cpus = observe(() => os.cpus());
  const processMemory = process as typeof process & { availableMemory?: () => number; constrainedMemory?: () => number };
  let diskFreeBytes: number | null = null;
  try {
    const disk = await statfs(os.homedir(), { bigint: true });
    const free = disk.bavail * disk.bsize;
    if (free >= BigInt(0)) diskFreeBytes = Number(free > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : free);
  } catch { /* The model runtime may use another volume; do not invent a capacity. */ }
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

// Planning estimates for the bounded text/context profile, not guaranteed runtime consumption.
const MEMORY_ESTIMATES: Record<LocalModelId, number> = { "qwen-mini": Math.ceil(1.75 * GIB), "gemma-small": Math.ceil(2.5 * GIB), "qwen-small": Math.ceil(3.5 * GIB) };
const purposes = ["documents", "writing", "browser"] as const;

export function localModelRecommendations(hardware: LocalModelHardware, installedCatalogIds: readonly LocalModelId[] = []): LocalModelRecommendation[] {
  const installed = new Set(installedCatalogIds);
  return purposes.map(purpose => {
    const extra = purpose === "browser" ? 1.5 * GIB : purpose === "writing" ? .5 * GIB : .25 * GIB;
    const memoryBudgetBytes = Math.max(0, hardware.availableMemoryBytes - RESERVED_MEMORY_BYTES - extra);
    const order: LocalModelId[] = purpose === "writing" ? ["qwen-small", "gemma-small", "qwen-mini"] : ["qwen-small", "qwen-mini", "gemma-small"];
    const candidates = order.map(id => LOCAL_MODELS.find(profile => profile.id === id)!);
    const candidate = candidates.find(profile => MEMORY_ESTIMATES[profile.id] <= memoryBudgetBytes
      && (installed.has(profile.id) || hardware.diskFreeBytes !== null && hardware.diskFreeBytes >= Math.ceil(profile.bytes * 2) + .5 * GIB));
    let reason: string;
    if (!hardware.totalMemoryBytes) reason = "No se pudo comprobar la memoria del equipo principal. Vuelve a comprobar antes de elegir un perfil.";
    else if (!candidates.some(profile => MEMORY_ESTIMATES[profile.id] <= memoryBudgetBytes)) reason = "El margen de memoria disponible es reducido. Cierra otras aplicaciones y vuelve a comprobar.";
    else if (!candidate) reason = hardware.diskFreeBytes === null ? "No se pudo comprobar el espacio de referencia para una descarga. Puedes usar un perfil verificado ya instalado." : "El espacio de referencia es reducido para una descarga con margen. Revisa el almacenamiento del equipo principal.";
    else reason = candidate.id === "qwen-mini" ? "Perfil ligero para etiquetas, datos explícitos y notas breves; revisa siempre el resultado." : purpose === "writing" ? "Perfil de texto para revisar y reorganizar pasajes breves; la redacción extensa necesita revisión por partes." : "Perfil de texto para resumir y extraer datos de pasajes breves con revisión.";
    if (purpose === "browser") reason += " Apoyo de lectura; las acciones del navegador y los conectores dependen del escritorio y sus permisos.";
    return { purpose, candidateId: hardware.totalMemoryBytes ? candidate?.id ?? null : null, reason, memoryBudgetBytes, estimate: true };
  });
}
