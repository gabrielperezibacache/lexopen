import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
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
  try {
    await requireStaff();
    const row = await prisma.integrationConfig.findUnique({ where: { provider: "google" } });
    const config = await getGoogleConfig();
    const state = randomBytes(24).toString("base64url");
    const authUrl = getGoogleAuthUrl(state);
    const res = NextResponse.json({
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
    if (authUrl) {
      res.cookies.set("google_oauth_state", state, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/api/integrations/google/callback",
        maxAge: 10 * 60,
      });
    }
    return res;
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await req.json();

    if (body.action === "push-plazo" && body.plazoId) {
      const result = await pushPlazoToGoogleCalendar(body.plazoId);
      return NextResponse.json(result);
    }
    if (body.action === "push-documento" && body.documentoId) {
      try {
        const result = await pushDocumentoToDrive(body.documentoId, {
          role: user.role,
        });
        return NextResponse.json(result);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Error Drive" },
          { status: 400 }
        );
      }
    }
    if (body.action === "push-minuta" && body.minutaId) {
      try {
        const result = await pushMinutaToDrive(body.minutaId, {
          role: user.role,
        });
        return NextResponse.json(result);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Error Drive" },
          { status: 400 }
        );
      }
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
  } catch (e) {
    return handleRouteError(e);
  }
}
