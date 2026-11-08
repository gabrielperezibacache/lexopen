import {
  getSmtpConfig,
  getTelegramConfig,
  getWebPushConfig,
} from "@/lib/notify/config";
import { createGmailProvider } from "./gmail";
import { createSmtpProvider } from "./smtp";
import { createTelegramProvider } from "./telegram";
import { createWebPushProvider } from "./webpush";
import { createWhatsAppProvider } from "./whatsapp";
import { getWhatsAppConfig } from "../whatsapp-config";
import type { ChannelProvider, ProviderId } from "./types";

export async function resolveEmailProvider(): Promise<ChannelProvider | null> {
  const smtp = await getSmtpConfig();
  if (smtp.enabled && smtp.config) {
    if (smtp.config.preferOverGmail !== false) {
      return createSmtpProvider(smtp.config);
    }
  }
  const gmail = createGmailProvider();
  const health = await gmail.health();
  if (health.ok) return gmail;
  if (smtp.enabled && smtp.config) return createSmtpProvider(smtp.config);
  return health.ok ? gmail : smtp.enabled && smtp.config ? createSmtpProvider(smtp.config) : null;
}

export async function getProvider(
  id: ProviderId | "email" | "whatsapp"
): Promise<ChannelProvider | null> {
  if (id === "email" || id === "smtp" || id === "gmail") {
    return resolveEmailProvider();
  }
  if (id === "telegram") {
    const tg = await getTelegramConfig();
    return tg.enabled && tg.config ? createTelegramProvider(tg.config) : null;
  }
  if (id === "webpush") {
    const wp = await getWebPushConfig();
    return wp.enabled && wp.config ? createWebPushProvider(wp.config) : null;
  }
  if (id === "whatsapp" || id === "whatsapp_meta" || id === "whatsapp_twilio") {
    const config = await getWhatsAppConfig();
    if (!config || (id !== "whatsapp" && id !== `whatsapp_${config.vendor}`)) return null;
    return createWhatsAppProvider(config);
  }
  return null;
}

export async function providersHealth() {
  const [email, telegram, webpush, waMeta, waTwilio] = await Promise.all([
    resolveEmailProvider().then(async (p) =>
      p ? { id: p.id, ...(await p.health()) } : { id: "email", ok: false, detail: "no configurado" }
    ),
    getProvider("telegram").then(async (p) =>
      p ? { id: p.id, ...(await p.health()) } : { id: "telegram", ok: false, detail: "no configurado" }
    ),
    getProvider("webpush").then(async (p) =>
      p ? { id: p.id, ...(await p.health()) } : { id: "webpush", ok: false, detail: "no configurado" }
    ),
    getProvider("whatsapp_meta").then(async p => p ? { id: p.id, ...await p.health() } : { id: "whatsapp_meta", ok: false, detail: "no configurado" }),
    getProvider("whatsapp_twilio").then(async p => p ? { id: p.id, ...await p.health() } : { id: "whatsapp_twilio", ok: false, detail: "no configurado" }),
  ]);
  return { email, telegram, webpush, whatsapp_meta: waMeta, whatsapp_twilio: waTwilio };
}
