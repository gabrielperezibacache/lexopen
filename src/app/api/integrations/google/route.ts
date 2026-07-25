import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createCausaDriveFolder,
  getGoogleAuthUrl,
  getGoogleConfig,
  linkCausaDriveFolder,
  pushDocumentoToDrive,
  pushMinutaToDrive,
  pushPlazoToGoogleCalendar,
  unlinkCausaDriveFolder,
} from "@/lib/integrations/google";

export async function GET() {
  const row = await prisma.integrationConfig.findUnique({ where: { provider: "google" } });
  const config = await getGoogleConfig();
  const authUrl = getGoogleAuthUrl();
  return NextResponse.json({
    enabled: row?.enabled ?? false,
    connected: Boolean(config.accessToken),
    connectedEmail: config.connectedEmail || null,
    authUrl,
    config: {
      syncDrive: config.syncDrive,
      syncCalendar: config.syncCalendar,
      scopes: config.scopes,
    },
    credentialsConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ),
  });
}

export async function POST(req: Request) {
  const body = await req.json();

  if (body.action === "push-plazo" && body.plazoId) {
    const result = await pushPlazoToGoogleCalendar(body.plazoId);
    return NextResponse.json(result);
  }
  if (body.action === "push-documento" && body.documentoId) {
    const result = await pushDocumentoToDrive(body.documentoId);
    return NextResponse.json(result);
  }
  if (body.action === "push-minuta" && body.minutaId) {
    const result = await pushMinutaToDrive(body.minutaId);
    return NextResponse.json(result);
  }
  if (body.action === "link-causa-folder" && body.causaId && body.folderRef) {
    try {
      const result = await linkCausaDriveFolder(body.causaId, body.folderRef);
      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Error al vincular" },
        { status: 400 }
      );
    }
  }
  if (body.action === "create-causa-folder" && body.causaId) {
    try {
      const result = await createCausaDriveFolder(body.causaId, {
        parentFolderId: body.parentFolderId,
        name: body.name,
      });
      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Error al crear carpeta" },
        { status: 400 }
      );
    }
  }
  if (body.action === "unlink-causa-folder" && body.causaId) {
    const result = await unlinkCausaDriveFolder(body.causaId);
    return NextResponse.json(result);
  }
  if (body.action === "disconnect") {
    const config = await getGoogleConfig();
    const rest = {
      scopes: config.scopes,
      syncDrive: config.syncDrive,
      syncCalendar: config.syncCalendar,
    };
    await prisma.integrationConfig.upsert({
      where: { provider: "google" },
      create: {
        provider: "google",
        enabled: false,
        configJson: JSON.stringify(rest),
      },
      update: {
        enabled: false,
        configJson: JSON.stringify(rest),
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
