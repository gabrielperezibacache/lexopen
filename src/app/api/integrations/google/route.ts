import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { isAdmin } from "@/lib/auth/rbac";
import { baseCookieOptions } from "@/lib/auth/cookie-options";
import {
  GoogleIntegrationError,
  createCausaDriveFolder,
  getGoogleAuthUrl,
  getGoogleConfig,
  googleActionHttpStatus,
  googleCredentialsConfigured,
  linkCausaDriveFolder,
  listCausaDriveFolder,
  pushDocumentoToDrive,
  pushMinutaToDrive,
  pushPlazoToGoogleCalendar,
  unlinkCausaDriveFolder,
  updateGoogleSyncOptions,
} from "@/lib/integrations/google";
import { sendGmailMessage } from "@/lib/integrations/gmail";

const OAUTH_STATE_COOKIE = "google_oauth_state";
/** Cookie scoped to callback path so it is not sent on other API calls. */
const OAUTH_STATE_PATH = "/api/integrations/google/callback";

function googleErrorResponse(e: unknown) {
  if (e instanceof GoogleIntegrationError) {
    const status =
      e.code === "disabled" || e.code === "sync_off"
        ? 403
        : e.code === "needs_oauth" || e.code === "needs_reconnect"
          ? 401
          : e.code === "credentials_missing"
            ? 503
            : 400;
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status }
    );
  }
  return null;
}

function jsonGoogleAction(result: { status?: string; message?: string }) {
  const status = googleActionHttpStatus(result.status || "ok");
  if (status >= 400) {
    return NextResponse.json(
      {
        error: result.message || "Google OAuth requerido",
        ...result,
      },
      { status }
    );
  }
  return NextResponse.json(result);
}

export async function GET() {
  try {
    await requireStaff();
    const row = await prisma.integrationConfig.findUnique({
      where: { provider: "google" },
    });
    const config = await getGoogleConfig();
    // Do NOT mint OAuth state here — every status poll would invalidate prior
    // "Conectar" links. Use POST action "start-oauth" instead.
    return NextResponse.json({
      enabled: row?.enabled ?? Boolean(config.accessToken),
      connected: Boolean(config.accessToken),
      connectedEmail: config.connectedEmail || null,
      authUrl: null,
      canStartOauth: googleCredentialsConfigured(),
      config: {
        syncDrive: config.syncDrive,
        syncCalendar: config.syncCalendar,
        scopes: config.scopes,
      },
      credentialsConfigured: googleCredentialsConfigured(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await req.json();

    if (body.action === "start-oauth") {
      if (!isAdmin(user.role)) {
        return NextResponse.json(
          { error: "Solo admin puede conectar Google Workspace" },
          { status: 403 }
        );
      }
      const state = randomBytes(24).toString("base64url");
      const authUrl = getGoogleAuthUrl(state);
      if (!authUrl) {
        return NextResponse.json(
          {
            error:
              "Configure GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el entorno",
            code: "credentials_missing",
          },
          { status: 503 }
        );
      }
      const res = NextResponse.json({ authUrl, ok: true });
      res.cookies.set(OAUTH_STATE_COOKIE, state, {
        ...baseCookieOptions({ maxAge: 10 * 60 }),
        path: OAUTH_STATE_PATH,
      });
      return res;
    }

    if (body.action === "push-plazo" && body.plazoId) {
      const result = await pushPlazoToGoogleCalendar(body.plazoId);
      return jsonGoogleAction(result);
    }
    if (body.action === "push-documento" && body.documentoId) {
      try {
        const result = await pushDocumentoToDrive(body.documentoId, {
          role: user.role,
        });
        return jsonGoogleAction(result);
      } catch (e) {
        return (
          googleErrorResponse(e) ||
          NextResponse.json(
            { error: e instanceof Error ? e.message : "Error Drive" },
            { status: 400 }
          )
        );
      }
    }
    if (body.action === "push-minuta" && body.minutaId) {
      try {
        const result = await pushMinutaToDrive(body.minutaId, {
          role: user.role,
        });
        return jsonGoogleAction(result);
      } catch (e) {
        return (
          googleErrorResponse(e) ||
          NextResponse.json(
            { error: e instanceof Error ? e.message : "Error Drive" },
            { status: 400 }
          )
        );
      }
    }
    if (body.action === "list-causa-folder" && body.causaId) {
      try {
        const result = await listCausaDriveFolder(body.causaId);
        return NextResponse.json(result);
      } catch (e) {
        return (
          googleErrorResponse(e) ||
          NextResponse.json(
            { error: e instanceof Error ? e.message : "Error al listar" },
            { status: 400 }
          )
        );
      }
    }
    if (body.action === "link-causa-folder" && body.causaId && body.folderRef) {
      try {
        const result = await linkCausaDriveFolder(body.causaId, body.folderRef);
        return NextResponse.json(result);
      } catch (e) {
        return (
          googleErrorResponse(e) ||
          NextResponse.json(
            { error: e instanceof Error ? e.message : "Error al vincular" },
            { status: 400 }
          )
        );
      }
    }
    if (body.action === "create-causa-folder" && body.causaId) {
      try {
        const result = await createCausaDriveFolder(body.causaId, {
          parentFolderId: body.parentFolderId,
          name: body.name,
        });
        return jsonGoogleAction(result);
      } catch (e) {
        return (
          googleErrorResponse(e) ||
          NextResponse.json(
            { error: e instanceof Error ? e.message : "Error al crear carpeta" },
            { status: 400 }
          )
        );
      }
    }
    if (body.action === "unlink-causa-folder" && body.causaId) {
      const result = await unlinkCausaDriveFolder(body.causaId);
      return NextResponse.json(result);
    }
    if (body.action === "disconnect") {
      if (!isAdmin(user.role)) {
        return NextResponse.json(
          { error: "Solo admin puede desconectar Google Workspace" },
          { status: 403 }
        );
      }
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

    if (body.action === "test-gmail") {
      if (!isAdmin(user.role)) {
        return NextResponse.json(
          { error: "Solo admin puede enviar prueba Gmail" },
          { status: 403 }
        );
      }
      const to =
        typeof body.to === "string" && body.to.includes("@")
          ? body.to.trim()
          : user.email;
      if (!to) {
        return NextResponse.json(
          { error: "Indique un destinatario o conecte un usuario con email" },
          { status: 400 }
        );
      }
      try {
        await sendGmailMessage({
          to,
          subject: "LexOpen · prueba Gmail",
          text: "Este es un mensaje de prueba enviado desde LexOpen (Google Workspace).",
          html: "<p>Este es un mensaje de prueba enviado desde <strong>LexOpen</strong> (Google Workspace).</p>",
        });
        return NextResponse.json({ ok: true, to });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Error Gmail" },
          { status: 400 }
        );
      }
    }

    if (body.action === "save-config") {
      if (!isAdmin(user.role)) {
        return NextResponse.json(
          { error: "Solo admin puede configurar Google" },
          { status: 403 }
        );
      }
      const saved = await updateGoogleSyncOptions({
        enabled: body.enabled,
        syncDrive: body.config?.syncDrive,
        syncCalendar: body.config?.syncCalendar,
      });
      return NextResponse.json({
        ok: true,
        config: {
          syncDrive: saved.syncDrive,
          syncCalendar: saved.syncCalendar,
          scopes: saved.scopes,
        },
        connected: Boolean(saved.accessToken),
        connectedEmail: saved.connectedEmail || null,
      });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (e) {
    return googleErrorResponse(e) || handleRouteError(e);
  }
}
