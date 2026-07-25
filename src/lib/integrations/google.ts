import { prisma } from "@/lib/db";
import {
  driveFolderUrl,
  parseGoogleDriveFolderRef,
} from "@/lib/integrations/drive-folder";

export type GoogleConfig = {
  scopes: string[];
  syncDrive: boolean;
  syncCalendar: boolean;
  accessToken?: string;
  refreshToken?: string;
  connectedEmail?: string;
};

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
  return { ...defaults, ...(JSON.parse(row.configJson) as Partial<GoogleConfig>) };
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
    const text = await res.text();
    throw new Error(`Google token error: ${text}`);
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
  };

  await prisma.integrationConfig.upsert({
    where: { provider: "google" },
    create: {
      provider: "google",
      enabled: true,
      configJson: JSON.stringify(next),
    },
    update: {
      enabled: true,
      configJson: JSON.stringify(next),
    },
  });

  return next;
}

/** Crea un evento de Calendar o un stub local si no hay token. */
export async function pushPlazoToGoogleCalendar(plazoId: string) {
  const plazo = await prisma.plazo.findUnique({
    where: { id: plazoId },
    include: { causa: true },
  });
  if (!plazo) throw new Error("Plazo no encontrado");

  const config = await getGoogleConfig();
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
    const text = await res.text();
    throw new Error(`Calendar API: ${text}`);
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
    throw new Error(await res.text());
  }

  return (await res.json()) as { id: string; name?: string; webViewLink?: string };
}

/** Sube un documento de texto a Drive (carpeta de la causa si existe). */
export async function pushDocumentoToDrive(documentoId: string) {
  const doc = await prisma.documento.findUnique({
    where: { id: documentoId },
    include: { causa: true },
  });
  if (!doc) throw new Error("Documento no encontrado");
  const config = await getGoogleConfig();
  const folderId = doc.causa?.googleDriveFolderId || null;

  if (!config.accessToken) {
    return {
      status: "stub" as const,
      message: folderId
        ? `Google Drive no conectado. El archivo iría a la carpeta ${folderId}.`
        : "Google Drive no conectado. OAuth requerido.",
      draft: {
        name: doc.nombre,
        mimeType: "text/markdown",
        parents: folderId ? [folderId] : undefined,
      },
    };
  }

  const file = await uploadMarkdownToDrive({
    name: doc.nombre,
    content: doc.contenido ?? "",
    folderId,
    accessToken: config.accessToken,
  });

  await prisma.documento.update({
    where: { id: doc.id },
    data: { googleDriveId: file.id },
  });
  return { status: "uploaded" as const, file, folderId };
}

/** Vincula una causa a una carpeta de Drive existente (URL o ID). */
export async function linkCausaDriveFolder(causaId: string, folderRef: string) {
  const parsed = parseGoogleDriveFolderRef(folderRef);
  if (!parsed) {
    throw new Error(
      "Referencia de carpeta inválida. Use la URL de Drive o el ID de la carpeta."
    );
  }

  const causa = await prisma.causa.findUnique({ where: { id: causaId } });
  if (!causa) throw new Error("Causa no encontrada");

  const config = await getGoogleConfig();
  let folderName =
    causa.rit || causa.titulo.slice(0, 80) || "Carpeta LexOpen";

  if (config.accessToken) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${parsed.folderId}?fields=id,name,webViewLink,mimeType`,
      { headers: { Authorization: `Bearer ${config.accessToken}` } }
    );
    if (res.ok) {
      const meta = (await res.json()) as {
        name?: string;
        mimeType?: string;
        webViewLink?: string;
      };
      if (
        meta.mimeType &&
        meta.mimeType !== "application/vnd.google-apps.folder"
      ) {
        throw new Error("El ID no corresponde a una carpeta de Google Drive.");
      }
      if (meta.name) folderName = meta.name;
    }
  }

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
      mensaje: `Carpeta Google Drive vinculada: ${folderName}`,
      causaId,
    },
  });

  return {
    status: config.accessToken ? ("linked" as const) : ("linked_stub" as const),
    causa: updated,
    folder: {
      id: parsed.folderId,
      name: folderName,
      url: parsed.folderUrl,
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

  const config = await getGoogleConfig();

  if (!config.accessToken) {
    const stubId = `stub-folder-${causa.id.slice(0, 8)}`;
    const url = driveFolderUrl(stubId);
    const updated = await prisma.causa.update({
      where: { id: causaId },
      data: {
        googleDriveFolderId: stubId,
        googleDriveFolderUrl: url,
        googleDriveFolderName: name,
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
        "Google no conectado: se guardó un enlace stub local. Conecte OAuth para crear la carpeta real.",
      causa: updated,
      folder: { id: stubId, name, url },
    };
  }

  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (opts?.parentFolderId) {
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
    throw new Error(await res.text());
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
export async function pushMinutaToDrive(minutaId: string) {
  const minuta = await prisma.minuta.findUnique({
    where: { id: minutaId },
    include: {
      causa: true,
      documento: true,
      autor: true,
      acciones: true,
    },
  });
  if (!minuta) throw new Error("Minuta no encontrada");

  const config = await getGoogleConfig();
  const folderId = minuta.causa.googleDriveFolderId;
  const content =
    minuta.documento?.contenido ||
    `# ${minuta.titulo}\n\n${minuta.resumenEjecutivo}`;
  const name = minuta.documento?.nombre || `Minuta — ${minuta.titulo}.md`;

  if (!config.accessToken) {
    return {
      status: "stub" as const,
      message: folderId
        ? `Drive no conectado. La minuta quedaría en la carpeta de la causa (${folderId}).`
        : "Drive no conectado y la causa no tiene carpeta vinculada.",
      draft: { name, parents: folderId ? [folderId] : undefined },
    };
  }

  if (!folderId) {
    return {
      status: "needs_folder" as const,
      message:
        "Vincule o cree una carpeta de Google Drive en la causa antes de subir la minuta.",
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
