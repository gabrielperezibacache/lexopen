import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";

/**
 * Almacenamiento de archivos:
 * - Si hay S3_* configurado, usa API S3-compatible (PUT/GET).
 * - Si no, escribe bajo ./storage (local; efímero en Render free).
 */

function localRoot() {
  return process.env.STORAGE_PATH || path.join(process.cwd(), "storage");
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

export async function putObject(opts: {
  key: string;
  body: Buffer | string;
  contentType?: string;
}) {
  const body =
    typeof opts.body === "string" ? Buffer.from(opts.body, "utf8") : opts.body;

  if (storageConfigured()) {
    const endpoint = process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET!;
    const url = endpoint
      ? `${endpoint.replace(/\/$/, "")}/${bucket}/${opts.key}`
      : `https://${bucket}.s3.${process.env.S3_REGION || "auto"}.amazonaws.com/${opts.key}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": opts.contentType || "application/octet-stream",
        Authorization: `Bearer ${process.env.S3_ACCESS_KEY_ID}`,
      },
      body: body as BodyInit,
    });
    if (!res.ok) {
      throw new Error(`S3 PUT failed: ${res.status}`);
    }
    return { key: opts.key, backend: "s3" as const, url };
  }

  const full = path.join(localRoot(), opts.key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
  return { key: opts.key, backend: "local" as const, path: full };
}

export async function getObject(key: string): Promise<Buffer | null> {
  if (storageConfigured()) {
    const endpoint = process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET!;
    const url = endpoint
      ? `${endpoint.replace(/\/$/, "")}/${bucket}/${key}`
      : `https://${bucket}.s3.${process.env.S3_REGION || "auto"}.amazonaws.com/${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  try {
    return await fs.readFile(path.join(localRoot(), key));
  } catch {
    return null;
  }
}
