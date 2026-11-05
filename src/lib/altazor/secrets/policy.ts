import { z } from "zod";
import { SecretError } from "./crypto";

export const SECRET_LIMITS = { perOwner: 250, characters: 2000, bytes: 2000, bodyBytes: 32 * 1024, grantMs: 60_000, holdMs: 5 * 60_000 } as const;
export const secretIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const requestId = z.string().regex(/^[A-Za-z0-9._:-]{8,160}$/);
const name = z.string().trim().min(1).max(120);
const provider = z.string().trim().min(1).max(120);
const username = z.string().trim().max(254).nullable().optional().transform(value => value || null);
const value = z.string().min(1).max(SECRET_LIMITS.characters).refine(input => Buffer.byteLength(input, "utf8") <= SECRET_LIMITS.bytes, "El secreto admite hasta 2000 bytes UTF-8 para escribirlo en el escritorio");
const kind = z.enum(["password", "api_token", "text"]);
export const createSecretSchema = z.object({ requestId, name, provider, username, kind, value }).strict();
export const rotateSecretSchema = z.object({ requestId, revision: z.number().int().min(1), name, provider, username, kind, value }).strict();
export const deleteSecretSchema = z.object({ requestId, revision: z.number().int().min(1), confirmed: z.literal(true) }).strict();
export type CreateSecretInput = z.input<typeof createSecretSchema>;
export type RotateSecretInput = z.input<typeof rotateSecretSchema>;
export type DeleteSecretInput = z.input<typeof deleteSecretSchema>;
export type SecretTarget = { sessionId: string; origin: string; field: "password" | "token" | "text"; fieldLabel: string };
const targetSchema = z.object({ sessionId: secretIdSchema, origin: z.string().max(300), field: z.enum(["password", "token", "text"]), fieldLabel: z.string().trim().min(1).max(120) }).strict();
export const prepareSecretUseSchema = z.object({ requestId, secretId: secretIdSchema, revision: z.number().int().min(1), target: targetSchema, confirmed: z.literal(true) }).strict();
export type PrepareSecretUseInput = z.input<typeof prepareSecretUseSchema>;
export function normalizeSecretTarget(input: SecretTarget): SecretTarget {
  const target = targetSchema.parse(input);
  try {
    const url = new URL(target.origin);
    // No URL credentials, query, fragment or path that could itself contain a secret.
    if (url.protocol !== "https:" || url.username || url.password || url.origin !== target.origin || !url.hostname) throw new Error();
    return { ...target, origin: url.origin };
  } catch { throw new SecretError("secret_target_invalid", "Confirme el origen HTTPS exacto de la aplicación y el campo de destino."); }
}
