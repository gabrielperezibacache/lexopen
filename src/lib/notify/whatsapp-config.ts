import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "./secrets";

export const e164 = /^\+[1-9]\d{7,14}$/;
export const whatsappFields = z.object({
  vendor: z.enum(["meta", "twilio"]),
  businessNumber: z.string().regex(e164),
  apiVersion: z.string().regex(/^v\d{2,3}\.0$/).optional(),
  phoneNumberId: z.string().regex(/^\d{5,30}$/).optional(),
  templateName: z.string().regex(/^[a-z0-9_]{1,512}$/).optional(),
  language: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/).optional(),
  accountSid: z.string().regex(/^AC[a-fA-F0-9]{32}$/).optional(),
  contentSid: z.string().regex(/^HX[a-fA-F0-9]{32}$/).optional(),
  callbackUrl: z.string().url().refine(v => new URL(v).protocol === "https:" && !new URL(v).username && !new URL(v).password && !new URL(v).search && !new URL(v).hash, "El webhook debe usar HTTPS, sin parámetros ni credenciales"),
  accessToken: z.string().min(16).max(4096).optional(),
  authToken: z.string().min(16).max(4096).optional(),
  appSecret: z.string().min(16).max(4096).optional(),
  verifyToken: z.string().min(24).max(256).optional(),
});
export type WhatsAppConfig = z.infer<typeof whatsappFields>;
const secrets = ["accessToken", "authToken", "appSecret", "verifyToken"] as const;
function parse(raw: string) { try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; } }
function complete(raw: Record<string, unknown>): WhatsAppConfig {
  const value = whatsappFields.parse(raw);
  const required = value.vendor === "meta"
    ? ["apiVersion", "phoneNumberId", "templateName", "language", "accessToken", "appSecret", "verifyToken"] as const
    : ["accountSid", "contentSid", "authToken"] as const;
  if (required.some(key => !value[key])) throw Object.assign(new Error("Complete los datos y secretos del proveedor de WhatsApp"), { status: 400 });
  const path = new URL(value.callbackUrl).pathname;
  if (path !== `/api/notify/whatsapp/webhook/${value.vendor}`) throw Object.assign(new Error("La URL del webhook no corresponde al proveedor"), { status: 400 });
  return value;
}
export async function getWhatsAppConfig() {
  const row = await prisma.integrationConfig.findUnique({ where: { provider: "whatsapp" } });
  if (!row?.enabled) return null;
  const raw = parse(row.configJson);
  for (const key of secrets) if (raw[key]) raw[key] = decryptSecret(String(raw[key]));
  try { return complete(raw); } catch { return null; }
}
export async function saveWhatsAppConfig(enabled: boolean, fields: Partial<WhatsAppConfig>, tx: Prisma.TransactionClient = prisma) {
  const old = await tx.integrationConfig.findUnique({ where: { provider: "whatsapp" } });
  const raw = parse(old?.configJson || "{}");
  const next = { ...raw, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== "")) };
  const plain = { ...next };
  for (const key of secrets) {
    if (fields[key]) next[key] = encryptSecret(fields[key]!);
    else if (next[key]) plain[key] = decryptSecret(String(next[key]));
  }
  if (enabled) complete(plain);
  if (raw.businessNumber && fields.businessNumber && raw.businessNumber !== fields.businessNumber) {
    // Codes and prior consent belong to the receiving business number.
    await tx.canalUsuario.updateMany({ where: { canal: "whatsapp", estado: { in: ["activo", "pendiente"] } }, data: { estado: "revocado", codigoHash: null, codigoExpiraAt: null } });
  }
  await tx.integrationConfig.upsert({ where: { provider: "whatsapp" }, create: { provider: "whatsapp", enabled, configJson: JSON.stringify(next) }, update: { enabled, configJson: JSON.stringify(next) } });
}
export async function whatsappSnapshot() {
  const row = await prisma.integrationConfig.findUnique({ where: { provider: "whatsapp" } });
  const raw = parse(row?.configJson || "{}");
  const fields = Object.fromEntries(Object.entries(raw).filter(([key]) => !secrets.includes(key as typeof secrets[number])));
  return { enabled: Boolean(row?.enabled), fields, hasCredentials: secrets.some(key => Boolean(raw[key])) };
}
