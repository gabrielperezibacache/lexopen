/**
 * Optional Redis / Upstash backend for distributed rate limiting.
 * Env:
 *   REDIS_URL / RATE_LIMIT_REDIS_URL  → redis:// or rediss://
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN → HTTP REST
 */

import net from "node:net";
import tls from "node:tls";

export type RedisWindowResult = {
  count: number;
  ttlMs: number;
};

function redisUrl() {
  return (
    process.env.RATE_LIMIT_REDIS_URL?.trim() ||
    process.env.REDIS_URL?.trim() ||
    ""
  );
}

function upstashConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

export function redisRateLimitConfigured() {
  return Boolean(redisUrl() || upstashConfigured());
}

function encodeResp(args: string[]) {
  let out = `*${args.length}\r\n`;
  for (const arg of args) {
    const size = Buffer.byteLength(arg);
    out += `$${size}\r\n${arg}\r\n`;
  }
  return out;
}

function parseSimpleResp(buf: Buffer): unknown[] {
  const text = buf.toString("utf8");
  const lines = text.split("\r\n").filter((line, i, arr) => {
    // Keep empty lines that are part of bulk strings carefully — our replies are integers/simple.
    return !(line === "" && i === arr.length - 1);
  });
  const values: unknown[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const type = line[0];
    const payload = line.slice(1);
    if (type === ":") {
      values.push(Number(payload));
    } else if (type === "+") {
      values.push(payload);
    } else if (type === "-") {
      throw new Error(`Redis error: ${payload}`);
    } else if (type === "$") {
      const len = Number(payload);
      if (len < 0) {
        values.push(null);
      } else {
        i += 1;
        values.push(lines[i] ?? "");
      }
    } else if (type === "*") {
      // ignore array headers; flatten subsequent elements
      continue;
    }
  }
  return values;
}

async function redisCommand(argsList: string[][]): Promise<unknown[]> {
  const raw = redisUrl();
  if (!raw) throw new Error("REDIS_URL missing");
  const url = new URL(raw);
  const port = Number(url.port || (url.protocol === "rediss:" ? 6380 : 6379));
  const host = url.hostname;
  const useTls = url.protocol === "rediss:";
  const password = decodeURIComponent(url.password || "");

  const payload =
    (password ? encodeResp(["AUTH", password]) : "") +
    argsList.map((args) => encodeResp(args)).join("");

  return new Promise((resolve, reject) => {
    const socket = useTls
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Redis timeout"));
    }, 2_000);
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("connect", () => {
      socket.write(payload);
      // Redis pipeline ends after replies; close write side.
      socket.end();
    });
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => {
      clearTimeout(timer);
      try {
        resolve(parseSimpleResp(Buffer.concat(chunks)));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function upstashIncr(key: string, windowMs: number): Promise<RedisWindowResult> {
  const base = process.env.UPSTASH_REDIS_REST_URL!.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const seconds = Math.max(1, Math.ceil(windowMs / 1000));
  const res = await fetch(`${base}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, String(seconds), "NX"],
      ["PTTL", key],
    ]),
    signal: AbortSignal.timeout(2_000),
    redirect: "error",
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  const data = (await res.json()) as Array<{ result: number | string | null }>;
  const count = Number(data[0]?.result || 0);
  let ttlMs = Number(data[2]?.result || windowMs);
  if (!Number.isFinite(ttlMs) || ttlMs < 0) ttlMs = windowMs;
  return { count, ttlMs };
}

async function tcpIncr(key: string, windowMs: number): Promise<RedisWindowResult> {
  const seconds = Math.max(1, Math.ceil(windowMs / 1000));
  const values = await redisCommand([
    ["INCR", key],
    ["EXPIRE", key, String(seconds), "NX"],
    ["PTTL", key],
  ]);
  // AUTH reply may prepend "+OK"
  const nums = values.filter((v) => typeof v === "number") as number[];
  const count = nums[0] || 0;
  let ttlMs = nums[nums.length - 1] ?? windowMs;
  if (!Number.isFinite(ttlMs) || ttlMs < 0) ttlMs = windowMs;
  return { count, ttlMs };
}

/** Returns null when Redis is not configured or the backend fails (caller falls back). */
export async function redisFixedWindowIncr(
  key: string,
  windowMs: number
): Promise<RedisWindowResult | null> {
  if (!redisRateLimitConfigured()) return null;
  const namespaced = `lexopen:rl:${key}`;
  try {
    if (upstashConfigured()) return await upstashIncr(namespaced, windowMs);
    return await tcpIncr(namespaced, windowMs);
  } catch (error) {
    console.warn("[rate-limit] Redis unavailable, using local store", error);
    return null;
  }
}
