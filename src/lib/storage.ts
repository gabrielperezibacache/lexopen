import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const MAX_STORAGE_OBJECT_BYTES = 25 * 1024 * 1024;

/**
 * Almacenamiento de archivos:
 * - Si hay S3_* configurado, usa API S3-compatible (PUT/GET).
 * - Si no, escribe bajo ./storage (local; efímero en Render free).
 */

function localRoot() {
  return path.resolve(process.env.STORAGE_PATH || path.join(process.cwd(), "storage"));
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
    process.env.LEXOPEN_DESKTOP === "1"
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
    return await fs.readFile(localPathForKey(key));
  } catch {
    return null;
  }
}
