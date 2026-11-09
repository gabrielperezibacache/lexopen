import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const MAX_STORAGE_OBJECT_BYTES = 25 * 1024 * 1024;

/** Cleanup only an unreferenced, isolated offline upload after a confirmed outcome. */
export async function discardOfflineFileAttempt(key: string): Promise<void> {
  if (!/^offline-files\/attempts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key)) throw new Error("Sólo se puede limpiar un intento aislado offline");
  await discardIsolatedObject(key);
}

/** Compensation is restricted to an isolated book-import attempt, never a shared source key. */
export async function discardBookImportAttempt(key: string): Promise<void> {
  assertSafeStorageKey(key);
  if (!/^library-books\/book_[a-f0-9]{40}\/attempts\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/(?:original|text)\/[a-f0-9]{64}$/.test(key)) throw new Error("Sólo se puede limpiar un intento aislado de importación");
  await discardIsolatedObject(key);
}

export async function discardCaseUploadAttempt(key: string): Promise<void> {
  assertSafeStorageKey(key);
  if (!/^(?:documentos\/case-intake-attempt|pjud\/intake-attempt)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key)) {
    throw new Error("Sólo se puede limpiar un intento aislado de carga");
  }
  await discardIsolatedObject(key);
}

async function discardIsolatedObject(key: string) {
  if (storageMode() === "incomplete") throw Object.assign(new Error("La configuración de almacenamiento está incompleta"), { status: 503 });
  if (storageConfigured()) {
    await s3Client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }), { abortSignal: AbortSignal.timeout(30_000) });
  } else {
    await fs.rm(localPathForKey(key), { force: true });
  }
}

/**
 * Almacenamiento de archivos:
 * - Si hay S3_* configurado, usa API S3-compatible (PUT/GET).
 * - Si no, escribe bajo ./storage (local; use LEXOPEN_DATA_DIR en Host).
 */

function localRoot() {
  // Uploaded documents belong to runtime storage, never the application package.
  return path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_PATH || path.join(process.cwd(), "storage"));
}

export function storageConfigured() {
  return storageMode() === "s3";
}

export function storageMode(): "s3" | "local" | "incomplete" {
  const configured = [
    process.env.S3_BUCKET,
    process.env.S3_ACCESS_KEY_ID,
    process.env.S3_SECRET_ACCESS_KEY,
  ];
  if (configured.every(Boolean)) return "s3";
  if (configured.some(Boolean)) return "incomplete";
  return "local";
}

export function persistentStorageReady() {
  return (
    storageMode() === "s3" ||
    process.env.NODE_ENV !== "production" ||
    process.env.LEXOPEN_DESKTOP === "1" ||
    (process.env.LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE === "1" &&
      Boolean(process.env.STORAGE_PATH))
  );
}

export function newStorageKey(prefix: string, filename: string) {
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  return `${prefix}/${Date.now()}-${randomBytes(4).toString("hex")}-${safe}`;
}

function assertSafeStorageKey(key: string) {
  if (
    !key ||
    key.includes("\0") ||
    key.startsWith("/") ||
    key.startsWith("\\") ||
    key.replaceAll("\\", "/").split("/").some((part) => part === "..")
  ) {
    const error = new Error("Clave de almacenamiento inválida") as Error & {
      status: number;
    };
    error.status = 400;
    throw error;
  }
}

function localPathForKey(key: string) {
  assertSafeStorageKey(key);
  const root = localRoot();
  const full = path.resolve(root, key);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
    const error = new Error("Clave de almacenamiento fuera del directorio permitido") as Error & {
      status: number;
    };
    error.status = 400;
    throw error;
  }
  return full;
}

function s3Client() {
  const endpoint = process.env.S3_ENDPOINT;
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint,
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
}

export async function putObject(opts: {
  key: string;
  body: Buffer | string;
  contentType?: string;
}) {
  const body =
    typeof opts.body === "string" ? Buffer.from(opts.body, "utf8") : opts.body;
  if (body.byteLength > MAX_STORAGE_OBJECT_BYTES) {
    const error = new Error(
      `El archivo supera el límite de ${MAX_STORAGE_OBJECT_BYTES} bytes`
    ) as Error & { status: number };
    error.status = 413;
    throw error;
  }
  assertSafeStorageKey(opts.key);

  if (storageMode() === "incomplete") {
    const error = new Error(
      "La configuración S3 está incompleta; no se usará almacenamiento local como fallback"
    ) as Error & { status: number };
    error.status = 503;
    throw error;
  }
  if (!persistentStorageReady()) {
    const error = new Error(
      "El almacenamiento local no es persistente en producción; configure S3-compatible"
    ) as Error & { status: number };
    error.status = 503;
    throw error;
  }

  if (storageConfigured()) {
    const bucket = process.env.S3_BUCKET!;
    await s3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: opts.key,
        Body: body,
        ContentType: opts.contentType || "application/octet-stream",
      })
    );
    return { key: opts.key, backend: "s3" as const };
  }

  const full = localPathForKey(opts.key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
  return { key: opts.key, backend: "local" as const, path: full };
}

export async function getObject(key: string): Promise<Buffer | null> {
  try {
    assertSafeStorageKey(key);
  } catch {
    return null;
  }
  if (storageConfigured()) {
    try {
      const res = await s3Client().send(
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET!,
          Key: key,
        })
      );
      if (!res.Body) return null;
      const bytes = await res.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch {
      return null;
    }
  }
  try {
    return await fs.readFile(/* turbopackIgnore: true */ localPathForKey(key));
  } catch {
    return null;
  }
}

/** A retained original may be missing or altered; never buffer beyond the verified-read budget. */
export async function getObjectBounded(key: string, maxBytes = MAX_STORAGE_OBJECT_BYTES): Promise<Buffer | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_STORAGE_OBJECT_BYTES) throw new RangeError("Límite de lectura inválido");
  try { assertSafeStorageKey(key); } catch { return null; }
  if (storageMode() === "incomplete") throw Object.assign(new Error("La configuración de almacenamiento está incompleta"), { status: 503 });
  const tooLarge = () => Object.assign(new Error("El original supera el límite de lectura verificable"), { status: 413 });
  if (storageConfigured()) {
    try {
      const response = await s3Client().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }), { abortSignal: AbortSignal.timeout(30_000) });
      if (!response.Body) return null;
      const reader = response.Body.transformToWebStream().getReader();
      const chunks: Uint8Array[] = []; let total = 0;
      try {
        if (response.ContentLength && response.ContentLength > maxBytes) { await reader.cancel(); throw tooLarge(); }
        for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.length; if (total > maxBytes) { await reader.cancel(); throw tooLarge(); } chunks.push(part.value); }
        return Buffer.concat(chunks, total);
      } finally { reader.releaseLock(); }
    } catch (error) { if (error && typeof error === "object" && "status" in error) throw error; return null; }
  }
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(/* turbopackIgnore: true */ localPathForKey(key), "r");
    if ((await handle.stat()).size > maxBytes) throw tooLarge();
    const chunks: Buffer[] = []; let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - total + 1));
      const { bytesRead } = await handle.read(chunk);
      if (!bytesRead) break;
      total += bytesRead; if (total > maxBytes) throw tooLarge(); chunks.push(chunk.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, total);
  } catch (error) { if (error && typeof error === "object" && "status" in error) throw error; return null; }
  finally { await handle?.close(); }
}
