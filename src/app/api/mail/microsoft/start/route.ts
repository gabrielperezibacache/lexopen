import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { getMicrosoftMailboxAuthUrl } from "@/lib/mail/oauth";
import {
  MICROSOFT_OAUTH_COOKIE,
  MICROSOFT_OAUTH_PATH,
  bindOauthState,
  setOauthStateCookie,
} from "@/lib/mail/oauth-cookie";

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const nonce = randomBytes(24).toString("base64url");
    const state = bindOauthState(user.id, nonce);
    const authUrl = getMicrosoftMailboxAuthUrl(state);
    if (!authUrl) {
      return NextResponse.json(
        {
          error:
            "Configure MICROSOFT_CLIENT_ID y MICROSOFT_CLIENT_SECRET (Azure app, Mail.Read).",
          code: "credentials_missing",
        },
        { status: 503 }
      );
    }
    const res = NextResponse.json({ authUrl, ok: true });
    return setOauthStateCookie(
      res,
      MICROSOFT_OAUTH_COOKIE,
      MICROSOFT_OAUTH_PATH,
      state
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
