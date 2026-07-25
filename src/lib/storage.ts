import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Almacenamiento de archivos:
 * - Si hay S3_* configurado, usa API S3-compatible (PUT/GET).
 * - Si no, escribe bajo ./storage (local; efímero en Render free).
 */

function localRoot() {
  return process.env.STORAGE_PATH || path.join(process.cwd(), "storage");
}

export function maxUploadBytes() {
  const configured = Number(process.env.MAX_UPLOAD_BYTES || "");
  return Number.isFinite(configured) && configured > 0 ? configured : 10 * 1024 * 1024;
}

export function assertUploadSize(sizeBytes: number) {
  const max = maxUploadBytes();
  if (sizeBytes > max) {
    const err = new Error(`Archivo supera el máximo permitido (${Math.round(max / 1024 / 1024)} MB)`) as Error & {
      status: number;
    };
    err.status = 413;
    throw err;
  }
}

export function storageConfigured() {
  return Boolean(
    process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
  );
}

export function newStorageKey(prefix: string, filename: string) {
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  return `${prefix}/${Date.now()}-${randomBytes(4).toString("hex")}-${safe}`;
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

  const full = path.join(localRoot(), opts.key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
  return { key: opts.key, backend: "local" as const, path: full };
}

export async function getObject(key: string): Promise<Buffer | null> {
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
    return await fs.readFile(path.join(localRoot(), key));
  } catch {
    return null;
  }
}
