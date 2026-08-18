import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api";
import { connectMailboxOauth } from "@/lib/mail/ingest";
import { exchangeMicrosoftMailboxCode } from "@/lib/mail/oauth";
import {
  MICROSOFT_OAUTH_COOKIE,
  MICROSOFT_OAUTH_PATH,
  clearOauthStateCookie,
  oauthStateMatches,
  oauthStateUserId,
} from "@/lib/mail/oauth-cookie";

function redirectTo(req: NextRequest, query: string) {
  return clearOauthStateCookie(
    NextResponse.redirect(new URL(`/correo?${query}`, req.url)),
    MICROSOFT_OAUTH_COOKIE,
    MICROSOFT_OAUTH_PATH
  );
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(MICROSOFT_OAUTH_COOKIE)?.value;

  if (error) return redirectTo(req, "microsoft=error");
  if (!code) return redirectTo(req, "microsoft=missing_code");
  if (!state || !expectedState || !oauthStateMatches(state, expectedState)) {
    return redirectTo(req, "microsoft=invalid_state");
  }

  try {
    const user = await requireStaff();
    if (oauthStateUserId(state) !== user.id) {
      return redirectTo(req, "microsoft=invalid_state");
    }
    const tokens = await exchangeMicrosoftMailboxCode(code);
    await connectMailboxOauth(user.id, "microsoft", tokens);
    return redirectTo(req, "microsoft=connected");
  } catch {
    return redirectTo(req, "microsoft=error");
  }
}
