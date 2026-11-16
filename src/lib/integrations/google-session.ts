import { prisma } from "@/lib/db";





import { decryptGoogleToken, encryptGoogleToken, isGoogleLegacyToken } from "@/lib/integrations/google-crypto";


export type GoogleConfig = {
  scopes: string[];
  syncDrive: boolean;
  syncCalendar: boolean;
  accessToken?: string;
  refreshToken?: string;
  connectedEmail?: string;
  /** epoch ms when accessToken expires */
  tokenExpiresAt?: number;
};

export type GoogleErrorCode =
  | "disabled"
  | "sync_off"
  | "needs_oauth"
  | "needs_reconnect"
  | "credentials_missing"
  | "api_error";

export class GoogleIntegrationError extends Error {
  code: GoogleErrorCode;
  constructor(code: GoogleErrorCode, message: string) {
    super(message);
    this.name = "GoogleIntegrationError";
    this.code = code;
  }
}

const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "email",
  "profile",
];

/** Never follow redirects on Google API calls (SSRF / token leak via Location). */
export function googleFetch(input: string, init?: RequestInit) {
  return fetch(input, { ...init, redirect: "error" });
}

export async function readGoogleError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text) as {
        error?: { message?: string; status?: string };
      };
      if (json.error?.message) return json.error.message;
    } catch {
      // not JSON
    }
    return text.slice(0, 240);
  } catch {
    return `HTTP ${res.status}`;
  }
}

function encryptGoogleConfig(config: GoogleConfig): GoogleConfig {
  return {
    ...config,
    accessToken: encryptGoogleToken(config.accessToken),
    refreshToken: encryptGoogleToken(config.refreshToken),
  };
}

function decryptGoogleConfig(config: GoogleConfig): GoogleConfig {
  return {
    ...config,
    accessToken: decryptGoogleToken(config.accessToken),
    refreshToken: decryptGoogleToken(config.refreshToken),
  };
}

export function googleCredentialsConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri() {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3000/api/integrations/google/callback"
  );
}

/** Pure gate used by API + tests. */
export function assertGoogleFeatureEnabled(opts: {
  enabled: boolean;
  syncDrive?: boolean;
  syncCalendar?: boolean;
  feature: "drive" | "calendar";
}) {
  if (!opts.enabled) {
    throw new GoogleIntegrationError(
      "disabled",
      "La integración Google está deshabilitada en Configuración."
    );
  }
  if (opts.feature === "drive" && opts.syncDrive === false) {
    throw new GoogleIntegrationError(
      "sync_off",
      "Sincronización de Drive desactivada en Configuración."
    );
  }
  if (opts.feature === "calendar" && opts.syncCalendar === false) {
    throw new GoogleIntegrationError(
      "sync_off",
      "Sincronización de Calendar desactivada en Configuración."
    );
  }
}

export async function getGoogleConfig(): Promise<GoogleConfig> {
  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "google" },
  });
  const defaults: GoogleConfig = {
    scopes: DEFAULT_SCOPES,
    syncDrive: true,
    syncCalendar: true,
  };
  if (!row) return defaults;
  const stored = JSON.parse(row.configJson) as Partial<GoogleConfig>;
  const hadLegacyXor = [stored.accessToken, stored.refreshToken].some((token) =>
    isGoogleLegacyToken(token)
  );
  const config = decryptGoogleConfig({
    ...defaults,
    ...stored,
  });
  // One-shot upgrade: rewrite XOR tokens as AES-GCM enc:v2.
  if (
    hadLegacyXor &&
    (config.accessToken || config.refreshToken) &&
    process.env.SESSION_SECRET
  ) {
    void saveGoogleConfig(config, row.enabled).catch((error) => {
      console.warn("[google] no se pudo migrar tokens enc:v1 → enc:v2", error);
    });
  }
  return config;
}

export async function isGoogleIntegrationEnabled(): Promise<boolean> {
  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "google" },
    select: { enabled: true },
  });
  if (row) return row.enabled;
  const config = await getGoogleConfig();
  return Boolean(config.accessToken);
}

export function getGoogleAuthUrl(state = "lexopen") {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = googleRedirectUri();
  if (!clientId) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: DEFAULT_SCOPES.join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = googleRedirectUri();

  if (!clientId || !clientSecret) {
    throw new GoogleIntegrationError(
      "credentials_missing",
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados"
    );
  }

  const res = await googleFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const detail = await readGoogleError(res);
    console.error("Google token exchange failed", res.status, detail);
    throw new GoogleIntegrationError(
      "api_error",
      `Google token exchange failed: ${detail}`
    );
  }

  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  let email: string | undefined;
  try {
    const profile = await googleFetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (profile.ok) {
      const data = (await profile.json()) as { email?: string };
      email = data.email;
    }
  } catch {
    // optional
  }

  const current = await getGoogleConfig();
  if (!tokens.refresh_token && (!email || !current.connectedEmail || email !== current.connectedEmail)) throw new GoogleIntegrationError("needs_reconnect", "Autoriza de nuevo la cuenta del estudio; no se mezclarán credenciales de cuentas distintas.");
  const next: GoogleConfig = {
    ...current,
    scopes: tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : current.scopes,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || current.refreshToken,
    connectedEmail: email,
    tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
  };

  await saveGoogleConfig(next, true);
  return next;
}

async function saveGoogleConfig(config: GoogleConfig, enabled = true) {
  const stored = encryptGoogleConfig(config);
  await prisma.integrationConfig.upsert({
    where: { provider: "google" },
    create: {
      provider: "google",
      enabled,
      configJson: JSON.stringify(stored),
    },
    update: {
      enabled,
      configJson: JSON.stringify(stored),
    },
  });
}

/** Actualiza opciones de sync sin tocar tokens OAuth. */
export async function updateGoogleSyncOptions(opts: {
  enabled?: boolean;
  syncDrive?: boolean;
  syncCalendar?: boolean;
}) {
  const current = await getGoogleConfig();
  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "google" },
  });
  await saveGoogleConfig(
    {
      ...current,
      syncDrive: opts.syncDrive ?? current.syncDrive,
      syncCalendar: opts.syncCalendar ?? current.syncCalendar,
    },
    opts.enabled ?? row?.enabled ?? Boolean(current.accessToken)
  );
  return getGoogleConfig();
}

async function clearGoogleAccessToken(config: GoogleConfig) {
  const next: GoogleConfig = {
    ...config,
    accessToken: undefined,
    tokenExpiresAt: undefined,
  };
  await saveGoogleConfig(next, true);
  return next;
}

/** Refresca el access token si está por expirar (buffer 60s). Fail-closed. */
export async function ensureGoogleAccessToken(): Promise<GoogleConfig> {
  const config = await getGoogleConfig();
  if (!config.accessToken) return config;

  const expiresAt = config.tokenExpiresAt || 0;
  if (expiresAt > Date.now() + 60_000) return config;
  if (!config.refreshToken) {
    await clearGoogleAccessToken(config);
    throw new GoogleIntegrationError(
      "needs_reconnect",
      "El token de Google expiró y no hay refresh token. Reconecte OAuth."
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GoogleIntegrationError(
      "credentials_missing",
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados"
    );
  }

  const res = await googleFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const detail = await readGoogleError(res);
    console.error("Google token refresh failed", res.status, detail);
    await clearGoogleAccessToken(config);
    throw new GoogleIntegrationError(
      "needs_reconnect",
      `No se pudo renovar el token de Google (${detail}). Reconecte OAuth.`
    );
  }

  const tokens = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  const next: GoogleConfig = {
    ...config,
    accessToken: tokens.access_token,
    tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
  };
  await saveGoogleConfig(next, true);
  return next;
}

export async function requireDriveSession() {
  const enabled = await isGoogleIntegrationEnabled();
  const stored = await getGoogleConfig();
  assertGoogleFeatureEnabled({
    enabled,
    syncDrive: stored.syncDrive,
    feature: "drive",
  });
  const config = await ensureGoogleAccessToken();
  if (!config.accessToken) {
    throw new GoogleIntegrationError(
      "needs_oauth",
      "Google Drive no conectado. Autorice OAuth en Integraciones."
    );
  }
  return config;
}

/** HTTP status for Drive/Calendar action payloads. Stub is 200 in dev, 4xx in production. */
export function googleActionHttpStatus(status: string): number {
  if (status === "needs_real_folder") return 400;
  if (status === "stub" && process.env.NODE_ENV === "production") return 400;
  return 200;
}

export function softGoogleFailure(e: GoogleIntegrationError): {
  status: "needs_reconnect" | "blocked" | "stub";
  message: string;
} {
  if (e.code === "needs_reconnect") {
    return { status: "needs_reconnect", message: e.message };
  }
  if (e.code === "sync_off" || e.code === "disabled") {
    return { status: "blocked", message: e.message };
  }
  if (process.env.NODE_ENV === "production") {
    throw e;
  }
  return { status: "stub", message: e.message };
}

export async function requireCalendarSession() {
  const enabled = await isGoogleIntegrationEnabled();
  const config = await ensureGoogleAccessToken();
  assertGoogleFeatureEnabled({
    enabled,
    syncCalendar: config.syncCalendar,
    feature: "calendar",
  });
  if (!config.accessToken) {
    throw new GoogleIntegrationError(
      "needs_oauth",
      "Google Calendar no conectado. Autorice OAuth en Integraciones."
    );
  }
  return config;
}

