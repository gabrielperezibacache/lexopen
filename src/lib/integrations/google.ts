import { prisma } from "@/lib/db";

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

/** Sube un documento de texto a Drive (o stub). */
export async function pushDocumentoToDrive(documentoId: string) {
  const doc = await prisma.documento.findUnique({ where: { id: documentoId } });
  if (!doc) throw new Error("Documento no encontrado");
  const config = await getGoogleConfig();

  if (!config.accessToken) {
    return {
      status: "stub" as const,
      message: "Google Drive no conectado. OAuth requerido.",
      draft: { name: doc.nombre, mimeType: "text/markdown" },
    };
  }

  const metadata = {
    name: doc.nombre,
    mimeType: "application/vnd.google-apps.document",
  };
  const boundary = "lexopen_boundary";
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n${doc.contenido ?? ""}\r\n--${boundary}--`;

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const file = (await res.json()) as { id: string };
  await prisma.documento.update({
    where: { id: doc.id },
    data: { googleDriveId: file.id },
  });
  return { status: "uploaded" as const, file };
}
