import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

const movementSchema = z.object({
  id: z.string().trim().min(1).max(255).optional(),
  externalId: z.string().trim().min(1).max(255).optional(),
  titulo: z.string().trim().min(1).max(2_000),
  detalle: z.string().max(20_000).optional().nullable(),
  fecha: z.string().trim().min(1).max(100),
  referencia: z.string().max(500).optional().nullable(),
});

export const pjudWebhookPayloadSchema = z
  .object({
    operationId: z.string().trim().min(1).max(200).optional(),
    status: z.enum(["ok", "partial", "error"]).optional(),
    causaId: z.string().trim().min(1).max(100).optional(),
    externalKey: z.string().trim().min(1).max(180).optional(),
    rit: z.string().trim().min(1).max(100).optional().nullable(),
    ruc: z.string().trim().min(1).max(100).optional().nullable(),
    tribunal: z.string().trim().min(1).max(255).optional(),
    movimientos: z.array(movementSchema).max(5_000).default([]),
  })
  .passthrough()
  .refine(
    (payload) =>
      Boolean(
        payload.causaId ||
          payload.externalKey ||
          (payload.rit && payload.tribunal) ||
          (payload.ruc && payload.tribunal)
      ),
    "El webhook PJUD debe identificar la causa"
  );

export type PjudWebhookPayload = z.infer<typeof pjudWebhookPayloadSchema>;

export function parsePjudWebhookPayload(input: unknown) {
  return pjudWebhookPayloadSchema.parse(input);
}

function signatureFor(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

export function signPjudWebhookPayload(
  rawBody: string,
  timestamp = Math.floor(Date.now() / 1000).toString()
) {
  const secret = process.env.PJUD_WEBHOOK_SECRET;
  if (!secret) throw new Error("PJUD_WEBHOOK_SECRET no configurado");
  return {
    timestamp,
    signature: `sha256=${signatureFor(secret, timestamp, rawBody)}`,
  };
}

export function verifyPjudWebhookSignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  const secret = process.env.PJUD_WEBHOOK_SECRET;
  if (!secret || !timestampHeader || !signatureHeader) return false;
  const timestamp = Number(timestampHeader);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const provided = signatureHeader.replace(/^sha256=/i, "");
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
  const expected = signatureFor(secret, timestampHeader, rawBody);
  const providedBytes = Buffer.from(provided, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
}

export function pjudWebhookConfigured() {
  return Boolean(process.env.PJUD_WEBHOOK_SECRET?.trim());
}
