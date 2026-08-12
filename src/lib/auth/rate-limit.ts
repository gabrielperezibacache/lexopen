import { promises as fs } from "fs";
import path from "path";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function storePath() {
  const explicit = process.env.LEXOPEN_RATE_LIMIT_PATH?.trim();
  if (explicit) return explicit;
  const dataDir = process.env.LEXOPEN_DATA_DIR?.trim();
  if (dataDir) return path.join(dataDir, "rate-limit.json");
  return null;
}

let fileCache: Record<string, Bucket> | null = null;
let fileDirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function loadFileStore() {
  const file = storePath();
  if (!file) return;
  if (fileCache) return;
  try {
    const raw = await fs.readFile(file, "utf8");
    fileCache = JSON.parse(raw) as Record<string, Bucket>;
  } catch {
    fileCache = {};
  }
}

function scheduleFlush() {
  const file = storePath();
  if (!file || !fileDirty) return;
  if (flushTimer) return;
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
    console.warn("[rate-limit] no se pudo persistir", error);
  }
}

function readBucket(key: string): Bucket | undefined {
  const memory = buckets.get(key);
  if (memory) return memory;
  return fileCache?.[key];
}

function writeBucket(key: string, bucket: Bucket) {
  buckets.set(key, bucket);
  if (fileCache) {
    fileCache[key] = bucket;
    fileDirty = true;
    scheduleFlush();
  }
}

function prune(now: number) {
  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }
  if (fileCache) {
    for (const [bucketKey, bucket] of Object.entries(fileCache)) {
      if (bucket.resetAt <= now) delete fileCache[bucketKey];
    }
  }
}

/** In-memory rate limiter; optionally mirrors to LEXOPEN_DATA_DIR/rate-limit.json. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  void loadFileStore();
  prune(now);
  const current = readBucket(key);
  if (!current || current.resetAt <= now) {
    writeBucket(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  current.count += 1;
  writeBucket(key, current);
  if (current.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: current.resetAt - now,
    };
  }
  return { ok: true, remaining: limit - current.count };
}

/**
 * Progressive lockout for auth failures: short window first, then longer ban.
 * Call on failed login/recover attempts.
 */
export function rateLimitAuthFailure(
  key: string,
  opts?: { softLimit?: number; softWindowMs?: number; hardLimit?: number; hardWindowMs?: number }
) {
  const softLimit = opts?.softLimit ?? 8;
  const softWindowMs = opts?.softWindowMs ?? 15 * 60 * 1000;
  const hardLimit = opts?.hardLimit ?? 20;
  const hardWindowMs = opts?.hardWindowMs ?? 60 * 60 * 1000;

  const soft = rateLimit(`auth-soft:${key}`, softLimit, softWindowMs);
  if (!soft.ok) {
    const hard = rateLimit(`auth-hard:${key}`, hardLimit, hardWindowMs);
    if (!hard.ok) {
      return {
        ok: false as const,
        remaining: 0,
        retryAfterMs: Math.max(soft.retryAfterMs || 0, hard.retryAfterMs || 0),
        locked: true as const,
      };
    }
    return {
      ok: false as const,
      remaining: 0,
      retryAfterMs: soft.retryAfterMs || softWindowMs,
      locked: false as const,
    };
  }
  return { ok: true as const, remaining: soft.remaining, locked: false as const };
}
