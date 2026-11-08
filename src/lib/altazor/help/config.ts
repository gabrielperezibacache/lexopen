import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { isAdmin } from "@/lib/auth/rbac";
import { can } from "@/lib/auth/permissions";
import { decryptSecret, encryptSecret, sha256Hex } from "@/lib/notify/secrets";
import { ntfyBaseUrl, validNtfyTopic, type NtfyConfig } from "@/lib/notify/providers/ntfy";
import type { WhatsAppMetaConfig } from "@/lib/notify/providers/whatsapp";
import { altazorActor, altazorTransaction } from "../access";
import { writeAuditStrict } from "@/lib/audit";

type Client = PrismaClient | Prisma.TransactionClient;
export type HelpChannelConfig = { ntfy: (NtfyConfig & { enabled: boolean }) | null; whatsapp: { enabled: boolean; channelId: string | null } };
export const helpConfigSchema = z.object({
  ntfy: z.object({ enabled: z.boolean(), baseUrl: z.string().max(300).default("https://ntfy.sh"), topic: z.string().max(160), replyTopic: z.string().max(160), token: z.string().max(3000).optional() }).strict().optional(),
  whatsapp: z.object({ enabled: z.boolean(), channelId: z.string().max(200).nullable() }).strict().optional(),
}).strict();
export const whatsAppConfigSchema = z.object({
  enabled: z.boolean(), phoneNumberId: z.string().regex(/^\d{5,40}$/), apiVersion: z.string().regex(/^v\d{1,3}\.\d$/).default("v23.0"),
  templateName: z.string().regex(/^[a-z0-9_]{1,100}$/), templateLanguage: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/).default("es"),
  displayPhone: z.string().max(40).optional(), accessToken: z.string().max(4000).optional(), appSecret: z.string().max(1000).optional(), verifyToken: z.string().max(1000).optional(),
}).strict();

function key(ownerId: string) { return `altazor-help:${sha256Hex(ownerId)}`; }
function unpack<T>(raw: string | undefined): T | null {
  try { const envelope = JSON.parse(raw || "{}"); const plain = decryptSecret(envelope.secret); return plain ? JSON.parse(plain) as T : null; } catch { return null; }
}
export async function getHelpChannelConfig(ownerId: string, client: Client = prisma): Promise<HelpChannelConfig> {
  const row = await client.integrationConfig.findUnique({ where: { provider: key(ownerId) } });
  return unpack<HelpChannelConfig>(row?.configJson) ?? { ntfy: null, whatsapp: { enabled: false, channelId: null } };
}
export function publicHelpConfig(config: HelpChannelConfig) {
  return { ntfy: config.ntfy ? { enabled: config.ntfy.enabled, baseUrl: config.ntfy.baseUrl, topic: config.ntfy.topic, replyTopic: config.ntfy.replyTopic, hasToken: Boolean(config.ntfy.token) } : null, whatsapp: config.whatsapp };
}

export async function saveHelpChannelConfig(user: { id: string }, raw: unknown, client: PrismaClient = prisma) {
  const input = helpConfigSchema.parse(raw);
  return altazorTransaction(client, async tx => {
    const actor = await tx.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
    if (!actor || !can(actor, "notify.channels.self")) throw httpError("No tiene permiso para configurar sus avisos.", 403);
    if (input.ntfy?.enabled || input.whatsapp?.enabled) await altazorActor(actor, tx);
    const config = await getHelpChannelConfig(actor.id, tx);
    if (input.ntfy) {
      const value = input.ntfy;
      let baseUrl: string;
      try { baseUrl = ntfyBaseUrl(value.baseUrl); } catch { throw httpError("Indica un servidor ntfy HTTPS público válido.", 400); }
      // A retained credential is bound to its server, never to whichever URL is submitted next.
      const sameServer = config.ntfy?.baseUrl === baseUrl;
      const replacement = value.token?.trim() || "";
      if (value.enabled && config.ntfy?.token && !sameServer && !replacement) throw httpError("Al cambiar el servidor ntfy, introduce un token para el nuevo servidor.", 400);
      const token = replacement || (sameServer ? config.ntfy?.token : "") || "";
      if (value.enabled && (!validNtfyTopic(value.topic) || !validNtfyTopic(value.replyTopic) || value.topic === value.replyTopic || !token || /[\r\n]/.test(token))) throw httpError("Configura dos temas privados diferentes (mínimo 16 caracteres) y un token ntfy.", 400);
      config.ntfy = { enabled: value.enabled, baseUrl, topic: value.topic, replyTopic: value.replyTopic, token };
    }
    if (input.whatsapp) {
      if (input.whatsapp.enabled) {
        const channel = await tx.canalUsuario.findFirst({ where: { id: input.whatsapp.channelId || "", userId: actor.id, canal: "whatsapp", estado: "activo", verificadoAt: { not: null } }, select: { id: true } });
        if (!channel) throw httpError("Vincula y verifica tu WhatsApp antes de activarlo.", 409);
      }
      config.whatsapp = input.whatsapp;
    }
    const configJson = JSON.stringify({ secret: encryptSecret(JSON.stringify(config)) });
    await tx.integrationConfig.upsert({ where: { provider: key(actor.id) }, create: { provider: key(actor.id), enabled: true, configJson }, update: { configJson } });
    await writeAuditStrict({ actorId: actor.id, action: "altazor.help.configure", entityType: "personal_help_channels", entityId: actor.id, after: { ntfy: Boolean(config.ntfy?.enabled), whatsapp: config.whatsapp.enabled } }, tx);
    return publicHelpConfig(config);
  });
}

export async function getWhatsAppMetaConfig(client: Client = prisma): Promise<WhatsAppMetaConfig | null> {
  const row = await client.integrationConfig.findUnique({ where: { provider: "whatsapp_meta" } });
  if (!row?.enabled) return null;
  const config = unpack<WhatsAppMetaConfig>(row.configJson);
  return config?.accessToken && config.appSecret && config.verifyToken ? config : null;
}
export async function whatsAppMetaSnapshot(client: Client = prisma) {
  const row = await client.integrationConfig.findUnique({ where: { provider: "whatsapp_meta" } });
  const config = unpack<WhatsAppMetaConfig>(row?.configJson);
  return { enabled: Boolean(row?.enabled), phoneNumberId: config?.phoneNumberId ?? "", apiVersion: config?.apiVersion ?? "v23.0", templateName: config?.templateName ?? "", templateLanguage: config?.templateLanguage ?? "es", displayPhone: config?.displayPhone ?? "", hasAccessToken: Boolean(config?.accessToken), hasAppSecret: Boolean(config?.appSecret), hasVerifyToken: Boolean(config?.verifyToken) };
}
export async function saveWhatsAppMetaConfig(user: { id: string }, raw: unknown, client: PrismaClient = prisma) {
  const input = whatsAppConfigSchema.parse(raw);
  return altazorTransaction(client, async tx => {
    const actor = await tx.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
    if (!actor || !isAdmin(actor)) throw httpError("Sólo la administración del Host puede configurar WhatsApp Meta.", 403);
    const row = await tx.integrationConfig.findUnique({ where: { provider: "whatsapp_meta" } });
    const previous = unpack<WhatsAppMetaConfig>(row?.configJson);
    const config: WhatsAppMetaConfig = { ...input, accessToken: input.accessToken?.trim() || previous?.accessToken || "", appSecret: input.appSecret?.trim() || previous?.appSecret || "", verifyToken: input.verifyToken?.trim() || previous?.verifyToken || "" };
    if (input.enabled && (!config.accessToken || !config.appSecret || config.verifyToken.length < 24)) throw httpError("Configura el token de Meta, el secreto de la aplicación y un token de verificación de al menos 24 caracteres.", 400);
    const configJson = JSON.stringify({ secret: encryptSecret(JSON.stringify(config)) });
    await tx.integrationConfig.upsert({ where: { provider: "whatsapp_meta" }, create: { provider: "whatsapp_meta", enabled: input.enabled, configJson }, update: { enabled: input.enabled, configJson } });
    await writeAuditStrict({ actorId: actor.id, action: "altazor.help.whatsapp.configure", entityType: "IntegrationConfig", entityId: "whatsapp_meta", after: { enabled: input.enabled, phoneNumberId: input.phoneNumberId } }, tx);
    return whatsAppMetaSnapshot(tx);
  });
}
