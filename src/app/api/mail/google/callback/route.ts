import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api";
import { connectMailboxOauth } from "@/lib/mail/ingest";
import { exchangeGmailMailboxCode } from "@/lib/mail/oauth";
import {
  GMAIL_OAUTH_COOKIE,
  GMAIL_OAUTH_PATH,
  clearOauthStateCookie,
  oauthStateMatches,
  oauthStateUserId,
} from "@/lib/mail/oauth-cookie";

function redirectTo(req: NextRequest, query: string) {
  return clearOauthStateCookie(
    NextResponse.redirect(new URL(`/correo?${query}`, req.url)),
    GMAIL_OAUTH_COOKIE,
    GMAIL_OAUTH_PATH
  );
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(GMAIL_OAUTH_COOKIE)?.value;

  if (error) return redirectTo(req, "gmail=error");
  if (!code) return redirectTo(req, "gmail=missing_code");
  if (!state || !expectedState || !oauthStateMatches(state, expectedState)) {
    return redirectTo(req, "gmail=invalid_state");
  }

  try {
    const user = await requireStaff();
    if (oauthStateUserId(state) !== user.id) {
      return redirectTo(req, "gmail=invalid_state");
    }
    const tokens = await exchangeGmailMailboxCode(code);
    await connectMailboxOauth(user.id, "gmail", tokens);
    return redirectTo(req, "gmail=connected");
  } catch {
    return redirectTo(req, "gmail=error");
  }
}
