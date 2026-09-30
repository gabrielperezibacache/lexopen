/**
 * Almacén en memoria (+ archivo opcional bajo `LEXOPEN_DATA_DIR`) para
 * planes del asistente (TTL 30 min) y tokens de undo. Mismo patrón que
 * `lib/auth/rate-limit.ts` (Host de un solo proceso; Redis no es necesario
 * para este store de corta vida — ver decisión Fase 1 en docs/PLAN-1.0.md).
 */

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { AssistantPlan } from "./types";

const PLAN_TTL_MS = 30 * 60 * 1000;

type Entry<T> = { value: T; expiresAt: number };

const memory = new Map<string, Entry<unknown>>();

function storePath(): string | null {
  const explicit = process.env.LEXOPEN_ASSISTANT_PLANS_PATH?.trim();
  if (explicit) return explicit;
  const dataDir = process.env.LEXOPEN_DATA_DIR?.trim();
  if (!dataDir) return null;
  return path.join(dataDir, "assistant-plans.json");
}

let fileCache: Record<string, Entry<unknown>> | null = null;
let loadingFileStore: Promise<void> | null = null;
let fileDirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function loadFileStore() {
  const file = storePath();
  if (!file || fileCache) return;
  loadingFileStore ??= (async () => {
    try {
      const raw = await fs.readFile(file, "utf8");
      fileCache = JSON.parse(raw) as Record<string, Entry<unknown>>;
    } catch {
      fileCache = {};
    }
  })();
  await loadingFileStore;
}

function scheduleFlush() {
  const file = storePath();
  if (!file || !fileDirty || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushFileStore();
  }, 250);
}

async function flushFileStore() {
  const file = storePath();
  if (!file || !fileCache || !fileDirty) return;
  fileDirty = false;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(fileCache), "utf8");
    await fs.rename(tmp, file);
  } catch (error) {
    console.warn("[assistant] no se pudo persistir plan-store", error);
  }
}

function prune(now: number) {
  for (const [key, entry] of memory) {
    if (entry.expiresAt <= now) memory.delete(key);
  }
  if (fileCache) {
    for (const [key, entry] of Object.entries(fileCache)) {
      if (entry.expiresAt <= now) delete fileCache[key];
    }
  }
}

function write<T>(key: string, value: T, ttlMs: number) {
  const entry: Entry<T> = { value, expiresAt: Date.now() + ttlMs };
  memory.set(key, entry);
  if (fileCache) {
    fileCache[key] = entry;
    fileDirty = true;
    scheduleFlush();
  }
}

function read<T>(key: string): T | null {
  prune(Date.now());
  const hit = (memory.get(key) as Entry<T> | undefined) ?? fileCache?.[key] as Entry<T> | undefined;
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.value;
}

function remove(key: string) {
  memory.delete(key);
  if (fileCache) {
    delete fileCache[key];
    fileDirty = true;
    scheduleFlush();
  }
}

type StoredPlan = { plan: AssistantPlan; ownerId: string };

/** `ownerId` (usuario que originó el plan) se guarda junto al plan, nunca expuesto en `AssistantPlan`. */
export async function storePlan(
  plan: AssistantPlan,
  ownerId: string,
  ttlMs = PLAN_TTL_MS
): Promise<AssistantPlan> {
  await loadFileStore();
  write<StoredPlan>(`plan:${plan.id}`, { plan, ownerId }, ttlMs);
  return plan;
}

/** `ownerId` opcional: si se indica y no coincide, se trata como no encontrado. */
export async function getPlan(id: string, ownerId?: string): Promise<AssistantPlan | null> {
  await loadFileStore();
  const stored = read<StoredPlan>(`plan:${id}`);
  if (!stored) return null;
  if (ownerId && stored.ownerId !== ownerId) return null;
  return stored.plan;
}

/** Lee y elimina el plan (uso único al confirmar). */
export async function consumePlan(id: string, ownerId?: string): Promise<AssistantPlan | null> {
  await loadFileStore();
  const stored = read<StoredPlan>(`plan:${id}`);
  if (!stored) return null;
  if (ownerId && stored.ownerId !== ownerId) return null;
  remove(`plan:${id}`);
  return stored.plan;
}

export type UndoPayload = {
  toolId: string;
  entityType: string;
  entityId: string;
  before?: unknown;
};

/** Genera un token de un solo uso para revertir una escritura del asistente. */
export async function storeUndo(
  payload: UndoPayload,
  ttlMs = PLAN_TTL_MS
): Promise<string> {
  await loadFileStore();
  const token = randomUUID();
  write(`undo:${token}`, payload, ttlMs);
  return token;
}

export async function consumeUndo(token: string): Promise<UndoPayload | null> {
  await loadFileStore();
  const payload = read<UndoPayload>(`undo:${token}`);
  if (payload) remove(`undo:${token}`);
  return payload;
}
