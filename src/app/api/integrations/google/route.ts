import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getGoogleAuthUrl,
  getGoogleConfig,
  pushDocumentoToDrive,
  pushPlazoToGoogleCalendar,
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
