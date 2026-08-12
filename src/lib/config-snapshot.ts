import { prisma } from "@/lib/db";
import { getHostStatus } from "@/lib/host-status";
import { getLlmConfig, publicLlmConfig, LLM_PRESET_CATALOG } from "@/lib/integrations/llm";
import { getObsidianConfig } from "@/lib/integrations/obsidian";
import { getGoogleConfig } from "@/lib/integrations/google";
import { captchaEnvSnippet } from "@/lib/pjud/captcha-solver";

type EnvMap = Record<string, string | undefined>;

export function envFlag(env: EnvMap, name: string, truthy = "1") {
  return env[name] === truthy;
}

export function envPresence(env: EnvMap, name: string) {
  return Boolean(env[name]?.trim());
}

export function envNumber(env: EnvMap, name: string, fallback: number) {
  const n = Number(env[name]);
  return Number.isFinite(n) ? n : fallback;
}

export function maskRut(rut: string | null | undefined) {
  if (!rut) return null;
  const clean = rut.trim();
  if (clean.length <= 4) return "••••";
  return `${clean.slice(0, 2)}••••${clean.slice(-2)}`;
}

export function buildSecurityFlags(env: EnvMap = process.env) {
  return {
    demoSwitcher: envFlag(env, "LEXOPEN_DEMO_SWITCHER"),
    openAccess: envFlag(env, "LEXOPEN_OPEN_ACCESS"),
    bootstrapTokenSet: envPresence(env, "LEXOPEN_BOOTSTRAP_TOKEN"),
    trustedProxy: envFlag(env, "LEXOPEN_TRUSTED_PROXY"),
    trustedOrigins: env.LEXOPEN_TRUSTED_ORIGINS || null,
    relaxCsrf: envFlag(env, "LEXOPEN_RELAX_CSRF"),
    sessionSecretSet: envPresence(env, "SESSION_SECRET"),
    allowPlaintextPasswords: envFlag(env, "LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS"),
  };
}

export function buildAppPublicConfig(env: EnvMap = process.env) {
  return {
    displayName: env.NEXT_PUBLIC_APP_NAME || "LexOpen",
    publicUrl: env.NEXT_PUBLIC_APP_URL || null,
    port: env.PORT || "3000",
  };
}

/**
 * Snapshot admin de todo lo configurable (sin secretos).
 * Mezcla DB + entorno efectivo para la página de Configuración.
 */
export async function getConfigSnapshot() {
  const [host, firm, llmRow, hermesRow, googleRow, obsidianRow, llm, obsidian, google] =
    await Promise.all([
      getHostStatus(),
      prisma.firmSettings.findFirst({
        select: {
          hermesAllowDemo: true,
          claveUnicaRut: true,
          claveUnicaPasswordEnc: true,
          claveUnicaEnabled: true,
          claveUnicaLastSyncAt: true,
          claveUnicaLastSyncStatus: true,
          claveUnicaLastSyncNote: true,
          pjudDigestLastAt: true,
          pjudDigestLastStatus: true,
          pjudDigestLastNote: true,
          defaultRetencionPct: true,
          ivaPct: true,
        },
      }),
      prisma.integrationConfig.findUnique({ where: { provider: "llm" } }),
      prisma.integrationConfig.findUnique({ where: { provider: "hermes" } }),
      prisma.integrationConfig.findUnique({ where: { provider: "google" } }),
      prisma.integrationConfig.findUnique({ where: { provider: "obsidian" } }),
      getLlmConfig(),
      getObsidianConfig(),
      getGoogleConfig(),
    ]);

  const env = process.env;

  return {
    generatedAt: new Date().toISOString(),
    app: {
      ...buildAppPublicConfig(env),
      version: host.app.version,
      environment: host.app.environment,
      desktop: host.app.desktop,
      dataDirectoryConfigured: host.app.dataDirectoryConfigured,
    },
    firm: {
      hermesAllowDemo: firm?.hermesAllowDemo ?? true,
      defaultRetencionPct: firm?.defaultRetencionPct ?? 0.1375,
      ivaPct: firm?.ivaPct ?? 0.19,
    },
    llm: {
      enabled: llmRow?.enabled ?? hermesRow?.enabled ?? true,
      config: publicLlmConfig(llm),
      presets: LLM_PRESET_CATALOG,
      env: {
        LLM_API_URL: envPresence(env, "LLM_API_URL") || envPresence(env, "HERMES_API_URL"),
        LLM_API_KEY: envPresence(env, "LLM_API_KEY") || envPresence(env, "HERMES_API_KEY"),
        LLM_MODEL: envPresence(env, "LLM_MODEL") || envPresence(env, "HERMES_MODEL"),
        LLM_ALLOW_DEMO: envFlag(env, "LLM_ALLOW_DEMO") || envFlag(env, "HERMES_ALLOW_DEMO"),
        privateUrlAllowed:
          envFlag(env, "LLM_ALLOW_PRIVATE_URL") || envFlag(env, "HERMES_ALLOW_PRIVATE_URL"),
      },
    },
    google: {
      enabled: googleRow?.enabled ?? false,
      connected: Boolean(google.accessToken),
      connectedEmail: google.connectedEmail || null,
      syncDrive: google.syncDrive,
      syncCalendar: google.syncCalendar,
      scopes: google.scopes,
      credentialsConfigured:
        envPresence(env, "GOOGLE_CLIENT_ID") && envPresence(env, "GOOGLE_CLIENT_SECRET"),
      redirectUri:
        env.GOOGLE_REDIRECT_URI ||
        "http://localhost:3000/api/integrations/google/callback",
    },
    obsidian: {
      enabled: obsidianRow?.enabled ?? false,
      config: obsidian,
      restConfigured: envPresence(env, "OBSIDIAN_REST_URL"),
      restTokenSet: envPresence(env, "OBSIDIAN_REST_TOKEN"),
      vaultEnvSet: envPresence(env, "OBSIDIAN_VAULT_PATH"),
    },
    claveUnica: {
      enabled: Boolean(firm?.claveUnicaEnabled),
      rutMasked: maskRut(firm?.claveUnicaRut),
      passwordSet: Boolean(firm?.claveUnicaPasswordEnc),
      lastSyncAt: firm?.claveUnicaLastSyncAt?.toISOString() || null,
      lastSyncStatus: firm?.claveUnicaLastSyncStatus || null,
      lastSyncNote: firm?.claveUnicaLastSyncNote || null,
      scrapeEnvEnabled: envFlag(env, "PJUD_CLAVEUNICA_SCRAPE"),
      manageHref: "/causas/mis-causas",
    },
    pjud: {
      ...host.pjud,
      digestFirm: {
        lastAt: firm?.pjudDigestLastAt?.toISOString() || null,
        lastStatus: firm?.pjudDigestLastStatus || null,
        lastNote: firm?.pjudDigestLastNote || null,
      },
      env: {
        PJUD_API_URL: envPresence(env, "PJUD_API_URL"),
        PJUD_API_KEY: envPresence(env, "PJUD_API_KEY"),
        PJUD_SCRAPER_URL: envPresence(env, "PJUD_SCRAPER_URL"),
        PJUD_SCRAPER_KEY: envPresence(env, "PJUD_SCRAPER_KEY"),
        PJUD_SCRAPER_ALLOW_PRIVATE: envFlag(env, "PJUD_SCRAPER_ALLOW_PRIVATE"),
        PJUD_PUBLIC_SCRAPE: envFlag(env, "PJUD_PUBLIC_SCRAPE"),
        PJUD_CLAVEUNICA_SCRAPE: envFlag(env, "PJUD_CLAVEUNICA_SCRAPE"),
        PJUD_ALLOW_DEMO: envFlag(env, "PJUD_ALLOW_DEMO"),
        PJUD_PDF_BACKUP: envFlag(env, "PJUD_PDF_BACKUP"),
        PJUD_WEBHOOK_SECRET: envPresence(env, "PJUD_WEBHOOK_SECRET"),
        PJUD_SECRETS_KEY: envPresence(env, "PJUD_SECRETS_KEY"),
        CRON_SECRET: envPresence(env, "CRON_SECRET"),
        CAPTCHA_SOLVER_PROVIDER: env.CAPTCHA_SOLVER_PROVIDER || null,
        CAPTCHA_SOLVER_API_KEY: envPresence(env, "CAPTCHA_SOLVER_API_KEY"),
        CAPTCHA_SOLVER_FALLBACK: env.CAPTCHA_SOLVER_FALLBACK || null,
      },
      intervals: {
        syncMinutes: envNumber(env, "PJUD_SYNC_INTERVAL_MINUTES", 240),
        misCausasMinutes: envNumber(env, "PJUD_MIS_CAUSAS_INTERVAL_MINUTES", 0),
        digestMinutes: envNumber(env, "PJUD_DIGEST_INTERVAL_MINUTES", 0),
        plazosAlertasMinutes: envNumber(
          env,
          "PLAZOS_ALERTAS_INTERVAL_MINUTES",
          0
        ),
        plazosAlertasDays: envNumber(env, "PLAZOS_ALERTAS_DAYS", 3),
        plazosAlertasEmail: envFlag(env, "PLAZOS_ALERTAS_EMAIL"),
        concurrency: envNumber(env, "PJUD_SYNC_CONCURRENCY", 5),
        dailySolveBudget: envNumber(env, "PJUD_CAUSAS_DAILY_SOLVE_BUDGET", 50),
        sessionTtlMs: envNumber(env, "PJUD_SESSION_TTL_MS", 1_500_000),
        cacheTtlMs: envNumber(env, "PJUD_CAUSAS_CACHE_TTL_MS", 21_600_000),
        scraperPort: envNumber(env, "PJUD_SCRAPER_PORT", 8787),
      },
      captchaSnippet: captchaEnvSnippet(),
    },
    storage: {
      ...host.storage,
      s3: {
        bucket: env.S3_BUCKET || null,
        region: env.S3_REGION || null,
        endpointSet: envPresence(env, "S3_ENDPOINT"),
        accessKeySet: envPresence(env, "S3_ACCESS_KEY_ID"),
        secretKeySet: envPresence(env, "S3_SECRET_ACCESS_KEY"),
      },
      allowLocalProduction: envFlag(env, "LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE"),
      storagePathSet: envPresence(env, "STORAGE_PATH"),
    },
    ocr: {
      ...host.ocr,
      settings: {
        enabled: env.OCR_ENABLED !== "0",
        language: env.OCR_LANGUAGE || "spa+eng",
        maxPages: envNumber(env, "OCR_MAX_PAGES", 20),
        timeoutMs: envNumber(env, "OCR_TIMEOUT_MS", 30_000),
        tesseractBin: env.OCR_TESSERACT_BIN || "tesseract",
        pdftoppmBin: env.OCR_PDFTOPPM_BIN || "pdftoppm",
      },
    },
    backups: {
      ...host.backups,
      keep: host.backups.retention ?? envNumber(env, "LEXOPEN_BACKUP_KEEP", 7),
      dirSet: envPresence(env, "LEXOPEN_BACKUP_DIR") || Boolean(env.LEXOPEN_DATA_DIR),
    },
    security: buildSecurityFlags(env),
    links: {
      integraciones: "/integraciones",
      misCausas: "/causas/mis-causas",
      monitoreo: "/causas/monitoreo",
      personas: "/personas",
      cuenta: "/cuenta",
      setup: "/setup",
      agente: "/agente",
    },
  };
}

export type ConfigSnapshot = Awaited<ReturnType<typeof getConfigSnapshot>>;
