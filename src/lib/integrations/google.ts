import { prisma } from "@/lib/db";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { getObject } from "@/lib/storage";
import {
  driveFolderUrl,
  isPlaceholderDriveFolderId,
  isRealDriveFolderId,
  makeStubFolderId,
  parseGoogleDriveFolderRef,
  stubFolderUrl,
} from "@/lib/integrations/drive-folder";

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

const TOKEN_PREFIX = "enc:v2:";
const LEGACY_TOKEN_PREFIX = "enc:v1:";

const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "email",
  "profile",
];

/** Never follow redirects on Google API calls (SSRF / token leak via Location). */
function googleFetch(input: string, init?: RequestInit) {
  return fetch(input, { ...init, redirect: "error" });
}

async function readGoogleError(res: Response): Promise<string> {
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

function encryptToken(value: string | undefined) {
  const secret = process.env.SESSION_SECRET;
  if (!value || value.startsWith(TOKEN_PREFIX)) return value;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET requerido para guardar tokens Google");
    }
    return value;
  }
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${TOKEN_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(value: string | undefined) {
  const secret = process.env.SESSION_SECRET;
  if (!value) return value;
  if (!secret) return value.startsWith(TOKEN_PREFIX) ? undefined : value;
  if (value.startsWith(LEGACY_TOKEN_PREFIX)) {
    try {
      const raw = Buffer.from(value.slice(LEGACY_TOKEN_PREFIX.length), "base64");
      const key = Buffer.from(secret, "utf8");
      return Buffer.from(raw.map((byte, idx) => byte ^ key[idx % key.length])).toString("utf8");
    } catch {
      return undefined;
    }
  }
  if (!value.startsWith(TOKEN_PREFIX)) return value;
  try {
    const [ivRaw, tagRaw, encryptedRaw] = value.slice(TOKEN_PREFIX.length).split(".");
    const key = createHash("sha256").update(secret).digest();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivRaw, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return undefined;
  }
}

function encryptGoogleConfig(config: GoogleConfig): GoogleConfig {
  return {
    ...config,
    accessToken: encryptToken(config.accessToken),
    refreshToken: encryptToken(config.refreshToken),
  };
}

function decryptGoogleConfig(config: GoogleConfig): GoogleConfig {
  return {
    ...config,
    accessToken: decryptToken(config.accessToken),
    refreshToken: decryptToken(config.refreshToken),
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
  return decryptGoogleConfig({
    ...defaults,
    ...(JSON.parse(row.configJson) as Partial<GoogleConfig>),
  });
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
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/gmail.send",
    ].join(" "),
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
  const next: GoogleConfig = {
    ...current,
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

async function requireDriveSession() {
  const enabled = await isGoogleIntegrationEnabled();
  const config = await ensureGoogleAccessToken();
  assertGoogleFeatureEnabled({
    enabled,
    syncDrive: config.syncDrive,
    feature: "drive",
  });
  if (!config.accessToken) {
    throw new GoogleIntegrationError(
      "needs_oauth",
      "Google Drive no conectado. Autorice OAuth en Integraciones."
    );
  }
  return config;
}

async function requireCalendarSession() {
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

function isTextMime(mime: string) {
  const m = mime.toLowerCase();
  return (
    !m ||
    m.startsWith("text/") ||
    m === "application/json" ||
    m === "application/markdown" ||
    m === "application/xml"
  );
}

type DriveFileResult = {
  id: string;
  name?: string;
  webViewLink?: string;
  updated?: boolean;
};

/** Crea o actualiza un archivo en Drive (binario u opcionalmente Google Doc). */
export async function uploadFileToDrive(opts: {
  name: string;
  content: Buffer | string;
  contentMimeType: string;
  /** Si true, Drive convierte el texto a Google Doc. */
  convertToGoogleDoc?: boolean;
  folderId?: string | null;
  existingFileId?: string | null;
  accessToken: string;
}): Promise<DriveFileResult> {
  const bytes =
    typeof opts.content === "string"
      ? Buffer.from(opts.content, "utf8")
      : opts.content;

  if (opts.existingFileId && isRealDriveFolderId(opts.existingFileId)) {
    const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
      opts.existingFileId
    )}?uploadType=media&fields=id,name,webViewLink`;
    const updateRes = await googleFetch(updateUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": opts.convertToGoogleDoc
          ? "text/plain"
          : opts.contentMimeType || "application/octet-stream",
      },
      body: new Uint8Array(bytes),
    });
    if (updateRes.ok) {
      const file = (await updateRes.json()) as DriveFileResult;
      return { ...file, updated: true };
    }
    if (updateRes.status !== 404) {
      const detail = await readGoogleError(updateRes);
      console.error("Google Drive update failed", updateRes.status, detail);
      throw new GoogleIntegrationError(
        "api_error",
        `Google Drive update failed: ${detail}`
      );
    }
    // 404 → crear de nuevo
  }

  const metadata: Record<string, unknown> = {
    name: opts.convertToGoogleDoc
      ? opts.name.replace(/\.md$/i, "") || opts.name
      : opts.name,
    mimeType: opts.convertToGoogleDoc
      ? "application/vnd.google-apps.document"
      : opts.contentMimeType || "application/octet-stream",
  };
  if (opts.folderId && isRealDriveFolderId(opts.folderId)) {
    metadata.parents = [opts.folderId];
  }

  const boundary = `lexopen_${randomBytes(8).toString("hex")}`;
  const metaPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    "utf8"
  );
  const contentHeader = Buffer.from(
    `--${boundary}\r\nContent-Type: ${
      opts.convertToGoogleDoc
        ? "text/plain; charset=UTF-8"
        : opts.contentMimeType || "application/octet-stream"
    }\r\n\r\n`,
    "utf8"
  );
  const closing = Buffer.from(`\r\n--${boundary}--`, "utf8");
  const body = Buffer.concat([metaPart, contentHeader, bytes, closing]);

  const res = await googleFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: new Uint8Array(body),
    }
  );

  if (!res.ok) {
    const detail = await readGoogleError(res);
    console.error("Google Drive upload failed", res.status, detail);
    throw new GoogleIntegrationError(
      "api_error",
      `Google Drive upload failed: ${detail}`
    );
  }

  return (await res.json()) as DriveFileResult;
}

/** @deprecated Prefer uploadFileToDrive. Kept for call-site clarity. */
async function uploadMarkdownToDrive(opts: {
  name: string;
  content: string;
  folderId?: string | null;
  existingFileId?: string | null;
  accessToken: string;
}) {
  return uploadFileToDrive({
    name: opts.name,
    content: opts.content,
    contentMimeType: "text/plain",
    convertToGoogleDoc: true,
    folderId: opts.folderId,
    existingFileId: opts.existingFileId,
    accessToken: opts.accessToken,
  });
}

/** Crea un evento de Calendar o un stub local si no hay token. */
export async function pushPlazoToGoogleCalendar(plazoId: string) {
  const plazo = await prisma.plazo.findUnique({
    where: { id: plazoId },
    include: { causa: true },
  });
  if (!plazo) throw new Error("Plazo no encontrado");

  let config: GoogleConfig;
  try {
    config = await requireCalendarSession();
  } catch (e) {
    if (
      e instanceof GoogleIntegrationError &&
      (e.code === "needs_oauth" ||
        e.code === "disabled" ||
        e.code === "sync_off" ||
        e.code === "needs_reconnect")
    ) {
      return {
        status:
          e.code === "needs_reconnect"
            ? ("needs_reconnect" as const)
            : e.code === "sync_off" || e.code === "disabled"
              ? ("blocked" as const)
              : ("stub" as const),
        message: e.message,
        draftEvent: {
          summary: `[LexOpen] ${plazo.titulo}`,
          description: `${plazo.descripcion ?? ""}\nCausa: ${plazo.causa?.titulo ?? "—"} (${plazo.causa?.rit ?? ""})`,
          start: plazo.fechaLimite.toISOString(),
        },
      };
    }
    throw e;
  }

  const end = new Date(plazo.fechaLimite.getTime() + 60 * 60 * 1000);
  const res = await googleFetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: `[LexOpen] ${plazo.titulo}`,
        description: `${plazo.descripcion ?? ""}\nCausa: ${plazo.causa?.titulo ?? ""}`,
        start: { dateTime: plazo.fechaLimite.toISOString() },
        end: { dateTime: end.toISOString() },
      }),
    }
  );

  if (!res.ok) {
    const detail = await readGoogleError(res);
    console.error("Google Calendar API failed", res.status, detail);
    throw new GoogleIntegrationError(
      "api_error",
      `Google Calendar API failed: ${detail}`
    );
  }

  const event = await res.json();
  return { status: "created" as const, event };
}

/** Sube un documento a Drive (binario original o Markdown → Google Doc). */
export async function pushDocumentoToDrive(
  documentoId: string,
  opts?: { role?: string }
) {
  const doc = await prisma.documento.findUnique({
    where: { id: documentoId },
    include: { causa: true },
  });
  if (!doc) throw new Error("Documento no encontrado");
  if (
    (doc.confidencial || doc.privilegio) &&
    opts?.role &&
    !canSeeConfidential(opts.role)
  ) {
    throw new Error("Documento confidencial o privilegiado");
  }

  const folderId = doc.causa?.googleDriveFolderId || null;
  const realFolder = isRealDriveFolderId(folderId) ? folderId : null;

  if (folderId && isPlaceholderDriveFolderId(folderId)) {
    return {
      status: "needs_real_folder" as const,
      message:
        "La causa tiene una carpeta stub/demo. Cree o vincule una carpeta real de Google Drive antes de subir.",
    };
  }

  let config: GoogleConfig;
  try {
    config = await requireDriveSession();
  } catch (e) {
    if (
      e instanceof GoogleIntegrationError &&
      (e.code === "needs_oauth" ||
        e.code === "disabled" ||
        e.code === "sync_off" ||
        e.code === "needs_reconnect")
    ) {
      return {
        status:
          e.code === "needs_reconnect"
            ? ("needs_reconnect" as const)
            : e.code === "needs_oauth"
              ? ("stub" as const)
              : ("blocked" as const),
        message: e.message,
        draft: {
          name: doc.nombre,
          mimeType: doc.mimeType || "application/octet-stream",
          parents: realFolder ? [realFolder] : undefined,
        },
      };
    }
    throw e;
  }

  const mime = (doc.mimeType || "").toLowerCase();
  const existingId =
    doc.googleDriveId && isRealDriveFolderId(doc.googleDriveId)
      ? doc.googleDriveId
      : null;

  // Prefer original binary from storage when not plain text.
  if (doc.storageKey && !isTextMime(mime)) {
    const stored = await getObject(doc.storageKey);
    if (stored && stored.length > 0) {
      const file = await uploadFileToDrive({
        name: doc.nombre,
        content: stored,
        contentMimeType: mime || "application/octet-stream",
        convertToGoogleDoc: false,
        folderId: realFolder,
        existingFileId: existingId,
        accessToken: config.accessToken!,
      });
      await prisma.documento.update({
        where: { id: doc.id },
        data: { googleDriveId: file.id },
      });
      return {
        status: "uploaded" as const,
        file,
        folderId: realFolder,
        updated: Boolean(file.updated),
        kind: "binary" as const,
        message: file.updated
          ? "Archivo actualizado en Google Drive."
          : "Archivo original subido a Google Drive.",
      };
    }
  }

  let content = (doc.contenido || "").trim();
  let uploadName = doc.nombre;
  let fromExtracted = false;

  if (doc.storageKey && isTextMime(mime)) {
    const stored = await getObject(doc.storageKey);
    if (!stored) throw new Error("Contenido no encontrado en almacenamiento");
    content = Buffer.from(stored).toString("utf8");
  } else if (!isTextMime(mime) || !content) {
    const extracted = (doc.extractedMarkdown || "").trim();
    if (extracted) {
      content = extracted;
      fromExtracted = true;
      if (!uploadName.toLowerCase().endsWith(".md")) {
        uploadName = `${uploadName.replace(/\.[^.]+$/i, "") || uploadName}.md`;
      }
    } else if (
      doc.extractionStatus === "needs_ocr" ||
      doc.extractionStatus === "pending"
    ) {
      return {
        status: "needs_ocr" as const,
        message:
          "No hay texto indexado aún. Espere OCR/extracción o reintente el procesamiento antes de subir a Drive.",
      };
    } else {
      return {
        status: "unsupported" as const,
        message:
          "No hay binario en storage ni Markdown extraído para subir a Drive.",
      };
    }
  }

  if (!content.trim()) {
    return {
      status: "unsupported" as const,
      message: "El documento no tiene contenido de texto para subir a Drive.",
    };
  }

  const file = await uploadMarkdownToDrive({
    name: uploadName,
    content,
    folderId: realFolder,
    existingFileId: existingId,
    accessToken: config.accessToken!,
  });

  await prisma.documento.update({
    where: { id: doc.id },
    data: { googleDriveId: file.id },
  });
  return {
    status: "uploaded" as const,
    file,
    folderId: realFolder,
    fromExtracted,
    updated: Boolean(file.updated),
    kind: "google_doc" as const,
    message: file.updated
      ? fromExtracted
        ? "Google Doc actualizado con el Markdown extraído."
        : "Google Doc actualizado en Drive."
      : fromExtracted
        ? "Subido a Drive el Markdown extraído como Google Doc (el binario original permanece en LexOpen)."
        : "Texto subido a Drive como Google Doc.",
  };
}

/** Vincula una causa a una carpeta de Drive existente (URL o ID). */
export async function linkCausaDriveFolder(causaId: string, folderRef: string) {
  const parsed = parseGoogleDriveFolderRef(folderRef);
  if (!parsed) {
    throw new Error(
      "Referencia de carpeta inválida. Use la URL de Drive o el ID de la carpeta."
    );
  }
  if (isPlaceholderDriveFolderId(parsed.folderId)) {
    throw new Error(
      "No se puede vincular un ID stub/demo. Use una carpeta real de Google Drive o créela desde LexOpen."
    );
  }

  const causa = await prisma.causa.findUnique({ where: { id: causaId } });
  if (!causa) throw new Error("Causa no encontrada");

  let config: GoogleConfig;
  try {
    config = await requireDriveSession();
  } catch (e) {
    if (
      e instanceof GoogleIntegrationError &&
      (e.code === "needs_oauth" ||
        e.code === "disabled" ||
        e.code === "sync_off" ||
        e.code === "needs_reconnect")
    ) {
      if (process.env.NODE_ENV === "production") {
        throw new GoogleIntegrationError(
          e.code === "needs_oauth" ? "needs_oauth" : e.code,
          e.code === "needs_oauth"
            ? "Google OAuth requerido para vincular carpetas Drive en producción."
            : e.message
        );
      }
      // Dev: allow offline link of a real-looking ID without verification.
      const folderName =
        causa.rit || causa.titulo.slice(0, 80) || "Carpeta LexOpen";
      const updated = await prisma.causa.update({
        where: { id: causaId },
        data: {
          googleDriveFolderId: parsed.folderId,
          googleDriveFolderUrl: parsed.folderUrl,
          googleDriveFolderName: folderName,
        },
      });
      await prisma.activity.create({
        data: {
          tipo: "drive",
          mensaje: `Carpeta Google Drive vinculada (sin verificar): ${folderName}`,
          causaId,
        },
      });
      return {
        status: "linked_offline" as const,
        message:
          "Carpeta guardada sin verificar (OAuth no conectado). Al conectar Google se podrá validar el acceso.",
        causa: updated,
        folder: {
          id: parsed.folderId,
          name: folderName,
          url: parsed.folderUrl,
        },
      };
    }
    throw e;
  }

  let folderName =
    causa.rit || causa.titulo.slice(0, 80) || "Carpeta LexOpen";
  let folderUrl = parsed.folderUrl;

  const res = await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${parsed.folderId}?fields=id,name,webViewLink,mimeType`,
    { headers: { Authorization: `Bearer ${config.accessToken}` } }
  );
  if (!res.ok) {
    const detail = await readGoogleError(res);
    throw new Error(
      `No se pudo verificar la carpeta en Drive (${detail}). Con el scope drive.file prefiera «Crear carpeta en Drive» o una carpeta creada por LexOpen.`
    );
  }
  const meta = (await res.json()) as {
    name?: string;
    mimeType?: string;
    webViewLink?: string;
  };
  if (meta.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error("El ID no corresponde a una carpeta de Google Drive.");
  }
  if (meta.name) folderName = meta.name;
  if (meta.webViewLink) folderUrl = meta.webViewLink;

  const updated = await prisma.causa.update({
    where: { id: causaId },
    data: {
      googleDriveFolderId: parsed.folderId,
      googleDriveFolderUrl: folderUrl,
      googleDriveFolderName: folderName,
    },
  });

  await prisma.activity.create({
    data: {
      tipo: "drive",
      mensaje: `Carpeta Google Drive vinculada: ${folderName}`,
      causaId,
    },
  });

  return {
    status: "linked" as const,
    causa: updated,
    folder: {
      id: parsed.folderId,
      name: folderName,
      url: folderUrl,
    },
  };
}

/** Crea una carpeta en Drive para la causa y la vincula. */
export async function createCausaDriveFolder(
  causaId: string,
  opts?: { parentFolderId?: string; name?: string }
) {
  const causa = await prisma.causa.findUnique({
    where: { id: causaId },
    include: { cliente: true },
  });
  if (!causa) throw new Error("Causa no encontrada");

  const name =
    opts?.name ||
    [causa.rit, causa.titulo].filter(Boolean).join(" — ").slice(0, 120) ||
    "Causa LexOpen";

  let config: GoogleConfig;
  try {
    config = await requireDriveSession();
  } catch (e) {
    if (
      e instanceof GoogleIntegrationError &&
      (e.code === "needs_oauth" ||
        e.code === "disabled" ||
        e.code === "sync_off" ||
        e.code === "needs_reconnect")
    ) {
      if (process.env.NODE_ENV === "production") {
        throw new GoogleIntegrationError(
          e.code === "needs_oauth" ? "needs_oauth" : e.code,
          e.code === "needs_oauth"
            ? "Google OAuth requerido para crear carpetas Drive en producción"
            : e.message
        );
      }
      if (e.code !== "needs_oauth") throw e;
      const stubId = makeStubFolderId(causa.id);
      const url = stubFolderUrl(stubId);
      const updated = await prisma.causa.update({
        where: { id: causaId },
        data: {
          googleDriveFolderId: stubId,
          googleDriveFolderUrl: url,
          googleDriveFolderName: `${name} (stub local)`,
        },
      });
      await prisma.activity.create({
        data: {
          tipo: "drive",
          mensaje: `Carpeta Drive (modo stub) preparada: ${name}`,
          causaId,
        },
      });
      return {
        status: "stub" as const,
        message:
          "Google no conectado: se guardó un marcador local (no es una carpeta real de Drive). Conecte OAuth y use «Crear carpeta en Drive».",
        causa: updated,
        folder: { id: stubId, name: `${name} (stub local)`, url },
      };
    }
    throw e;
  }

  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (opts?.parentFolderId && isRealDriveFolderId(opts.parentFolderId)) {
    metadata.parents = [opts.parentFolderId];
  }

  const res = await googleFetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    const detail = await readGoogleError(res);
    console.error("Google Drive folder creation failed", res.status, detail);
    throw new GoogleIntegrationError(
      "api_error",
      `Google Drive folder creation failed: ${detail}`
    );
  }

  const folder = (await res.json()) as { id: string; name?: string };
  const url = driveFolderUrl(folder.id);

  const updated = await prisma.causa.update({
    where: { id: causaId },
    data: {
      googleDriveFolderId: folder.id,
      googleDriveFolderUrl: url,
      googleDriveFolderName: folder.name || name,
    },
  });

  await prisma.activity.create({
    data: {
      tipo: "drive",
      mensaje: `Carpeta Google Drive creada y vinculada: ${folder.name || name}`,
      causaId,
    },
  });

  return {
    status: "created" as const,
    causa: updated,
    folder: { id: folder.id, name: folder.name || name, url },
  };
}

export async function unlinkCausaDriveFolder(causaId: string) {
  const updated = await prisma.causa.update({
    where: { id: causaId },
    data: {
      googleDriveFolderId: null,
      googleDriveFolderUrl: null,
      googleDriveFolderName: null,
    },
  });
  await prisma.activity.create({
    data: {
      tipo: "drive",
      mensaje: "Se desvinculó la carpeta de Google Drive",
      causaId,
    },
  });
  return { status: "unlinked" as const, causa: updated };
}

/** Lista archivos de la carpeta Drive de la causa (creados/visibles con drive.file). */
export async function listCausaDriveFolder(causaId: string) {
  const causa = await prisma.causa.findUnique({
    where: { id: causaId },
    select: {
      id: true,
      googleDriveFolderId: true,
      googleDriveFolderName: true,
    },
  });
  if (!causa) throw new Error("Causa no encontrada");
  if (!isRealDriveFolderId(causa.googleDriveFolderId)) {
    return {
      status: "needs_real_folder" as const,
      message: "Vincule o cree una carpeta real de Google Drive en la causa.",
      files: [] as Array<{
        id: string;
        name: string;
        mimeType: string;
        webViewLink?: string;
        modifiedTime?: string;
      }>,
    };
  }

  const config = await requireDriveSession();
  const q = `'${causa.googleDriveFolderId}' in parents and trashed=false`;
  const params = new URLSearchParams({
    q,
    pageSize: "50",
    fields: "files(id,name,mimeType,webViewLink,modifiedTime)",
    orderBy: "modifiedTime desc",
  });
  const res = await googleFetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    { headers: { Authorization: `Bearer ${config.accessToken}` } }
  );
  if (!res.ok) {
    const detail = await readGoogleError(res);
    throw new GoogleIntegrationError(
      "api_error",
      `No se pudo listar la carpeta Drive: ${detail}`
    );
  }
  const data = (await res.json()) as {
    files?: Array<{
      id: string;
      name: string;
      mimeType: string;
      webViewLink?: string;
      modifiedTime?: string;
    }>;
  };
  return {
    status: "ok" as const,
    folderId: causa.googleDriveFolderId,
    folderName: causa.googleDriveFolderName,
    files: data.files || [],
  };
}

/** Sube el Markdown de una minuta a la carpeta Drive de la causa. */
export async function pushMinutaToDrive(
  minutaId: string,
  opts?: { role?: string }
) {
  const minuta = await prisma.minuta.findUnique({
    where: { id: minutaId },
    include: {
      causa: true,
      documento: true,
      autor: { select: { id: true, name: true } },
      acciones: true,
    },
  });
  if (!minuta) throw new Error("Minuta no encontrada");
  if (minuta.confidencial && opts?.role && !canSeeConfidential(opts.role)) {
    throw new Error("Minuta confidencial");
  }

  const folderId = minuta.causa.googleDriveFolderId;
  let content =
    minuta.documento?.contenido ||
    `# ${minuta.titulo}\n\n${minuta.resumenEjecutivo}`;
  if (minuta.documento?.storageKey) {
    const stored = await getObject(minuta.documento.storageKey);
    if (stored) content = Buffer.from(stored).toString("utf8");
  }
  const name = minuta.documento?.nombre || `Minuta — ${minuta.titulo}.md`;

  if (!folderId || isPlaceholderDriveFolderId(folderId)) {
    return {
      status: "needs_real_folder" as const,
      message:
        "Vincule o cree una carpeta real de Google Drive en la causa antes de subir la minuta.",
    };
  }

  let config: GoogleConfig;
  try {
    config = await requireDriveSession();
  } catch (e) {
    if (
      e instanceof GoogleIntegrationError &&
      (e.code === "needs_oauth" ||
        e.code === "disabled" ||
        e.code === "sync_off" ||
        e.code === "needs_reconnect")
    ) {
      return {
        status:
          e.code === "needs_reconnect"
            ? ("needs_reconnect" as const)
            : e.code === "needs_oauth"
              ? ("stub" as const)
              : ("blocked" as const),
        message: e.message,
        draft: {
          name,
          parents: [folderId],
        },
      };
    }
    throw e;
  }

  const existingId =
    (minuta.googleDriveFileId && isRealDriveFolderId(minuta.googleDriveFileId)
      ? minuta.googleDriveFileId
      : null) ||
    (minuta.documento?.googleDriveId &&
    isRealDriveFolderId(minuta.documento.googleDriveId)
      ? minuta.documento.googleDriveId
      : null);

  const file = await uploadMarkdownToDrive({
    name,
    content,
    folderId,
    existingFileId: existingId,
    accessToken: config.accessToken!,
  });

  await prisma.minuta.update({
    where: { id: minuta.id },
    data: { googleDriveFileId: file.id },
  });
  if (minuta.documentoId) {
    await prisma.documento.update({
      where: { id: minuta.documentoId },
      data: { googleDriveId: file.id },
    });
  }

  return {
    status: "uploaded" as const,
    file,
    folderId,
    updated: Boolean(file.updated),
    message: file.updated
      ? "Minuta actualizada en la carpeta Drive de la causa."
      : undefined,
  };
}
