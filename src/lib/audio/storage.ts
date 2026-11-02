import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { promises as fs } from "node:fs";
import path from "node:path";
import { storageMode } from "@/lib/storage";

/** Cleanup is restricted to a single new upload attempt; historical originals cannot be passed here. */
export async function discardAudioAttempt(key: string) {
  if (!/^case-audio\/audio_[a-f0-9]{40}\/attempts\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/original\/[a-f0-9]{64}$/.test(key)) throw new Error("Clave temporal de audio inválida");
  const mode = storageMode(); if (mode === "incomplete") throw Object.assign(new Error("La configuración de almacenamiento está incompleta"), { status: 503 });
  if (mode === "s3") {
    const endpoint = process.env.S3_ENDPOINT;
    const client = new S3Client({ region: process.env.S3_REGION || "auto", endpoint, forcePathStyle: Boolean(endpoint), credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! } });
    await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }), { abortSignal: AbortSignal.timeout(30_000) });
  } else await fs.rm(path.resolve(process.env.STORAGE_PATH || path.join(process.cwd(), "storage"), key), { force: true });
}
