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

const TOKEN_PREFIX = "enc:v2:";
const LEGACY_TOKEN_PREFIX = "enc:v1:";

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

export async function getGoogleConfig(): Promise<GoogleConfig> {
  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "google" },
  });
  const defaults: GoogleConfig = {
    scopes: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/gmail.send",
      "openid",
      "email",
      "profile",
    ],
    syncDrive: true,
    syncCalendar: true,
  };
  if (!row) return defaults;
  return decryptGoogleConfig({
    ...defaults,
    ...(JSON.parse(row.configJson) as Partial<GoogleConfig>),
  });
}

export function getGoogleAuthUrl(state = "lexopen") {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3000/api/integrations/google/callback";
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
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3000/api/integrations/google/callback";

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
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
    console.error("Google token exchange failed", res.status);
    throw new Error("Google token exchange failed");
  }

  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  let email: string | undefined;
  try {
    const profile = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
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

/** Refresca el access token si está por expirar (buffer 60s). */
export async function ensureGoogleAccessToken(): Promise<GoogleConfig> {
  const config = await getGoogleConfig();
  if (!config.accessToken) return config;

  const expiresAt = config.tokenExpiresAt || 0;
  if (expiresAt > Date.now() + 60_000) return config;
  if (!config.refreshToken) return config;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return config;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return config;

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

/** Crea un evento de Calendar o un stub local si no hay token. */
export async function pushPlazoToGoogleCalendar(plazoId: string) {
  const plazo = await prisma.plazo.findUnique({
    where: { id: plazoId },
    include: { causa: true },
  });
  if (!plazo) throw new Error("Plazo no encontrado");

  const config = await ensureGoogleAccessToken();
  if (!config.accessToken) {
    return {
      status: "stub" as const,
      message:
        "Google Workspace no conectado. Conecte OAuth para crear el evento en Calendar.",
      draftEvent: {
        summary: `[LexOpen] ${plazo.titulo}`,
        description: `${plazo.descripcion ?? ""}\nCausa: ${plazo.causa?.titulo ?? "—"} (${plazo.causa?.rit ?? ""})`,
        start: plazo.fechaLimite.toISOString(),
      },
    };
  }

  const end = new Date(plazo.fechaLimite.getTime() + 60 * 60 * 1000);
  const res = await fetch(
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
    console.error("Google Calendar API failed", res.status);
    throw new Error("Google Calendar API failed");
  }

  const event = await res.json();
  return { status: "created" as const, event };
}

async function uploadMarkdownToDrive(opts: {
  name: string;
  content: string;
  folderId?: string | null;
  accessToken: string;
}) {
  const metadata: Record<string, unknown> = {
    name: opts.name.replace(/\.md$/i, "") || opts.name,
    mimeType: "application/vnd.google-apps.document",
  };
  if (opts.folderId) {
    metadata.parents = [opts.folderId];
  }

  const boundary = "lexopen_boundary";
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n${opts.content}\r\n--${boundary}--`;

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    console.error("Google Drive upload failed", res.status);
    throw new Error("Google Drive upload failed");
  }

  return (await res.json()) as { id: string; name?: string; webViewLink?: string };
}

/** Sube un documento de texto a Drive (carpeta de la causa si existe). */
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
  const config = await ensureGoogleAccessToken();
  const folderId = doc.causa?.googleDriveFolderId || null;
  const realFolder = isRealDriveFolderId(folderId) ? folderId : null;

  if (!config.accessToken) {
    return {
      status: "stub" as const,
      message: realFolder
        ? `Google Drive no conectado. El archivo iría a la carpeta ${realFolder}.`
        : "Google Drive no conectado. OAuth requerido.",
      draft: {
        name: doc.nombre,
        mimeType: "text/markdown",
        parents: realFolder ? [realFolder] : undefined,
      },
    };
  }

  if (folderId && isPlaceholderDriveFolderId(folderId)) {
    return {
      status: "needs_real_folder" as const,
      message:
        "La causa tiene una carpeta stub/demo. Cree o vincule una carpeta real de Google Drive antes de subir.",
    };
  }

  let content = doc.contenido ?? "";
  if (doc.storageKey) {
    const stored = await getObject(doc.storageKey);
    if (!stored) throw new Error("Contenido no encontrado en almacenamiento");
    const mime = (doc.mimeType || "").toLowerCase();
    if (
      mime &&
      !mime.startsWith("text/") &&
      mime !== "application/json" &&
      mime !== "application/markdown"
    ) {
      throw new Error(
        "Solo se pueden subir a Drive documentos de texto/markdown desde LexOpen"
      );
    }
    content = Buffer.from(stored).toString("utf8");
  }

  const file = await uploadMarkdownToDrive({
    name: doc.nombre,
    content,
    folderId: realFolder,
    accessToken: config.accessToken,
  });

  await prisma.documento.update({
    where: { id: doc.id },
    data: { googleDriveId: file.id },
  });
  return { status: "uploaded" as const, file, folderId: realFolder };
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

  const config = await ensureGoogleAccessToken();
  let folderName =
    causa.rit || causa.titulo.slice(0, 80) || "Carpeta LexOpen";
  let folderUrl = parsed.folderUrl;

  if (config.accessToken) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${parsed.folderId}?fields=id,name,webViewLink,mimeType`,
      { headers: { Authorization: `Bearer ${config.accessToken}` } }
    );
    if (!res.ok) {
      throw new Error(
        "No se pudo verificar la carpeta en Drive (¿scope drive.file o carpeta no accesible?). Prefiera «Crear carpeta en Drive»."
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
  }

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
    status: config.accessToken ? ("linked" as const) : ("linked_offline" as const),
    message: config.accessToken
      ? undefined
      : "Carpeta guardada sin verificar (OAuth no conectado). Al conectar Google se podrá validar el acceso.",
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

  const config = await ensureGoogleAccessToken();

  if (!config.accessToken) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Google OAuth requerido para crear carpetas Drive en producción");
    }
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

  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (opts?.parentFolderId && isRealDriveFolderId(opts.parentFolderId)) {
    metadata.parents = [opts.parentFolderId];
  }

  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    console.error("Google Drive folder creation failed", res.status);
    throw new Error("Google Drive folder creation failed");
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

  const config = await ensureGoogleAccessToken();
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

  if (!config.accessToken) {
    return {
      status: "stub" as const,
      message: `Drive no conectado. La minuta quedaría en la carpeta de la causa (${folderId}). Conecte OAuth en Integraciones.`,
      draft: {
        name,
        parents: [folderId],
      },
    };
  }

  const file = await uploadMarkdownToDrive({
    name,
    content,
    folderId,
    accessToken: config.accessToken,
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

  return { status: "uploaded" as const, file, folderId };
}
