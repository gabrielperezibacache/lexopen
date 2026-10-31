/**
 * Configuración de proveedores de notificación en IntegrationConfig
 * (provider=smtp|telegram|webpush). Secretos cifrados con lib/notify/secrets.
 */

import { prisma } from "@/lib/db";
import {
  decryptSecret,
  encryptSecret,
  secretsKeyConfigured,
} from "@/lib/notify/secrets";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  /** Preferir SMTP sobre Gmail cuando ambos existen. */
  preferOverGmail?: boolean;
};

export type TelegramConfig = {
  botToken: string;
  botUsername?: string;
};

export type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string; // mailto: o https:
};

function parseJson(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function encField(obj: Record<string, unknown>, key: string) {
  const v = obj[key];
  if (typeof v === "string" && v && !v.startsWith("enc:s1:")) {
    obj[key] = encryptSecret(v);
  }
}

function decField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  if (typeof v !== "string" || !v) return undefined;
  if (v.startsWith("enc:s1:")) return decryptSecret(v);
  return v;
}

export async function getSmtpConfig(): Promise<{
  enabled: boolean;
  config: SmtpConfig | null;
}> {
  const row = await prisma.integrationConfig.findUnique({ where: { provider: "smtp" } });
  if (!row?.enabled) return { enabled: false, config: null };
  const raw = parseJson(row.configJson);
  const pass = decField(raw, "pass");
  const config: SmtpConfig = {
    host: String(raw.host || ""),
    port: Number(raw.port || 587),
    secure: Boolean(raw.secure),
    user: raw.user ? String(raw.user) : undefined,
    pass,
    from: String(raw.from || ""),
    preferOverGmail: Boolean(raw.preferOverGmail ?? true),
  };
  if (!config.host || !config.from) return { enabled: false, config: null };
  return { enabled: true, config };
}

export async function saveSmtpConfig(opts: {
  enabled: boolean;
  config: Partial<SmtpConfig> & { pass?: string };
}) {
  if (!secretsKeyConfigured() && opts.config.pass) {
    throw Object.assign(new Error("Configure LEXOPEN_SECRETS_KEY o SESSION_SECRET"), {
      status: 400,
    });
  }
  const existing = await prisma.integrationConfig.findUnique({ where: { provider: "smtp" } });
  const prev = parseJson(existing?.configJson || "{}");
  const next: Record<string, unknown> = {
    host: opts.config.host ?? prev.host ?? "",
    port: opts.config.port ?? prev.port ?? 587,
    secure: opts.config.secure ?? prev.secure ?? false,
    user: opts.config.user ?? prev.user ?? "",
    from: opts.config.from ?? prev.from ?? "",
    preferOverGmail: opts.config.preferOverGmail ?? prev.preferOverGmail ?? true,
    pass: prev.pass,
  };
  if (opts.config.pass !== undefined && opts.config.pass !== "") {
    next.pass = opts.config.pass;
    encField(next, "pass");
  }
  return prisma.integrationConfig.upsert({
    where: { provider: "smtp" },
    create: { provider: "smtp", enabled: opts.enabled, configJson: JSON.stringify(next) },
    update: { enabled: opts.enabled, configJson: JSON.stringify(next) },
  });
}

export async function getTelegramConfig(): Promise<{
  enabled: boolean;
  config: TelegramConfig | null;
}> {
  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "telegram" },
  });
  if (!row?.enabled) return { enabled: false, config: null };
  const raw = parseJson(row.configJson);
  const botToken = decField(raw, "botToken");
  if (!botToken) return { enabled: false, config: null };
  return {
    enabled: true,
    config: {
      botToken,
      botUsername: raw.botUsername ? String(raw.botUsername) : undefined,
    },
  };
}

export async function saveTelegramConfig(opts: {
  enabled: boolean;
  botToken?: string;
  botUsername?: string;
}) {
  const existing = await prisma.integrationConfig.findUnique({
    where: { provider: "telegram" },
  });
  const prev = parseJson(existing?.configJson || "{}");
  const next: Record<string, unknown> = {
    botToken: prev.botToken,
    botUsername: opts.botUsername ?? prev.botUsername ?? "",
  };
  if (opts.botToken) {
    next.botToken = opts.botToken;
    encField(next, "botToken");
  }
  return prisma.integrationConfig.upsert({
    where: { provider: "telegram" },
    create: {
      provider: "telegram",
      enabled: opts.enabled,
      configJson: JSON.stringify(next),
    },
    update: { enabled: opts.enabled, configJson: JSON.stringify(next) },
  });
}

export async function getWebPushConfig(): Promise<{
  enabled: boolean;
  config: WebPushConfig | null;
}> {
  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "webpush" },
  });
  if (!row?.enabled) return { enabled: false, config: null };
  const raw = parseJson(row.configJson);
  const privateKey = decField(raw, "privateKey");
  const publicKey = String(raw.publicKey || "");
  const subject = String(raw.subject || "mailto:admin@localhost");
  if (!publicKey || !privateKey) return { enabled: false, config: null };
  return { enabled: true, config: { publicKey, privateKey, subject } };
}

export async function saveWebPushConfig(opts: {
  enabled: boolean;
  publicKey?: string;
  privateKey?: string;
  subject?: string;
}) {
  const existing = await prisma.integrationConfig.findUnique({
    where: { provider: "webpush" },
  });
  const prev = parseJson(existing?.configJson || "{}");
  const next: Record<string, unknown> = {
    publicKey: opts.publicKey ?? prev.publicKey ?? "",
    privateKey: prev.privateKey,
    subject: opts.subject ?? prev.subject ?? "mailto:admin@localhost",
  };
  if (opts.privateKey) {
    next.privateKey = opts.privateKey;
    encField(next, "privateKey");
  }
  return prisma.integrationConfig.upsert({
    where: { provider: "webpush" },
    create: {
      provider: "webpush",
      enabled: opts.enabled,
      configJson: JSON.stringify(next),
    },
    update: { enabled: opts.enabled, configJson: JSON.stringify(next) },
  });
}

/** Resumen admin sin secretos. */
export async function notifyProvidersSnapshot() {
  const [smtp, telegram, webpush] = await Promise.all([
    prisma.integrationConfig.findUnique({ where: { provider: "smtp" } }),
    prisma.integrationConfig.findUnique({ where: { provider: "telegram" } }),
    prisma.integrationConfig.findUnique({ where: { provider: "webpush" } }),
  ]);
  const smtpRaw = parseJson(smtp?.configJson || "{}");
  const tgRaw = parseJson(telegram?.configJson || "{}");
  const wpRaw = parseJson(webpush?.configJson || "{}");
  return {
    smtp: {
      enabled: Boolean(smtp?.enabled),
      host: smtpRaw.host || null,
      from: smtpRaw.from || null,
      hasPass: Boolean(smtpRaw.pass),
    },
    telegram: {
      enabled: Boolean(telegram?.enabled),
      botUsername: tgRaw.botUsername || null,
      hasToken: Boolean(tgRaw.botToken),
    },
    webpush: {
      enabled: Boolean(webpush?.enabled),
      publicKey: wpRaw.publicKey || null,
      subject: wpRaw.subject || null,
      hasPrivateKey: Boolean(wpRaw.privateKey),
    },
    whatsapp: {
      enabled: false,
      note: "WhatsApp Cloud API / Twilio en LexOpen 1.2 (solo interfaz en 1.1).",
    },
  };
}
