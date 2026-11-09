import { isAdmin } from "@/lib/auth/rbac";
import { connectStudyGmail } from "@/lib/integrations/google-study-mail";
import { studyDriveMode } from "@/lib/integrations/google-study-drive";
import { MAIL_SETTINGS_PATH } from "@/lib/mail/settings-location";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { getGmailMailboxAuthUrl } from "@/lib/mail/oauth";
import {
  GMAIL_OAUTH_COOKIE,
  GMAIL_OAUTH_PATH,
  bindOauthState,
  setOauthStateCookie,
} from "@/lib/mail/oauth-cookie";

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    if (isAdmin(user)) {
      const reused = await connectStudyGmail(user.id);
      return NextResponse.json({ authUrl: reused ? `${MAIL_SETTINGS_PATH}?gmail=connected` : "/configuracion#google-settings", reused });
    }
    if (await studyDriveMode()) return NextResponse.json({ error: "La administración gestiona el buzón compartido. No necesitas autorizar Google de nuevo." }, { status: 403 });
    const nonce = randomBytes(24).toString("base64url");
    const state = bindOauthState(user.id, nonce);
    const authUrl = getGmailMailboxAuthUrl(state);
    if (!authUrl) {
      return NextResponse.json(
        {
          error:
            "Configure GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET y habilite Gmail API (gmail.readonly).",
          code: "credentials_missing",
        },
        { status: 503 }
      );
    }
    const res = NextResponse.json({ authUrl, ok: true });
    return setOauthStateCookie(res, GMAIL_OAUTH_COOKIE, GMAIL_OAUTH_PATH, state);
  } catch (e) {
    return handleRouteError(e);
  }
}
