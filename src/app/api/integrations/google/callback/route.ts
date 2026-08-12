import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/integrations/google";
import { requireStaff } from "@/lib/api";
import { isAdmin } from "@/lib/auth/rbac";
import { baseCookieOptions } from "@/lib/auth/cookie-options";

const OAUTH_STATE_COOKIE = "google_oauth_state";
const OAUTH_STATE_PATH = "/api/integrations/google/callback";

function stateMatches(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function clearOauthState(res: NextResponse) {
  // Must match the path used when setting the cookie.
  res.cookies.set(OAUTH_STATE_COOKIE, "", {
    ...baseCookieOptions({ maxAge: 0 }),
    path: OAUTH_STATE_PATH,
  });
  return res;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (error) {
    return clearOauthState(
      NextResponse.redirect(new URL("/integraciones?google=error", req.url))
    );
  }
  if (!code) {
    return clearOauthState(
      NextResponse.redirect(new URL("/integraciones?google=missing_code", req.url))
    );
  }
  if (!state || !expectedState || !stateMatches(state, expectedState)) {
    return clearOauthState(
      NextResponse.redirect(new URL("/integraciones?google=invalid_state", req.url))
    );
  }

  try {
    const user = await requireStaff();
    if (!isAdmin(user.role)) {
      return clearOauthState(
        NextResponse.redirect(
          new URL("/integraciones?google=forbidden", req.url)
        )
      );
    }
    await exchangeGoogleCode(code);
    return clearOauthState(
      NextResponse.redirect(new URL("/integraciones?google=connected", req.url))
    );
  } catch {
    return clearOauthState(
      NextResponse.redirect(new URL("/integraciones?google=error", req.url))
    );
  }
}
