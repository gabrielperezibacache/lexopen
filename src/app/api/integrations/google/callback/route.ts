import { connectStudyGmail } from "@/lib/integrations/google-study-mail";
import { timingSafeEqual, createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/integrations/google";
import { requireStaff } from "@/lib/api";
import { isAdmin } from "@/lib/auth/rbac";
import { baseCookieOptions } from "@/lib/auth/cookie-options";
import { resolveOAuthReturnUrl } from "@/lib/net/oauth-return-url";

const OAUTH_STATE_COOKIE = "google_oauth_state";
const OAUTH_STATE_PATH = "/api/integrations/google/callback";

function stateMatches(provided: string, expected: string) {
  try {
    const a = createHmac("sha256", expected).update(provided).digest();
    const b = createHmac("sha256", expected).update(expected).digest();
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
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
      NextResponse.redirect(
        resolveOAuthReturnUrl(
          req.url,
          "/integraciones?google=error",
          process.env.GOOGLE_REDIRECT_URI
        )
      )
    );
  }
  if (!code) {
    return clearOauthState(
      NextResponse.redirect(
        resolveOAuthReturnUrl(
          req.url,
          "/integraciones?google=missing_code",
          process.env.GOOGLE_REDIRECT_URI
        )
      )
    );
  }
  if (!state || !expectedState || !stateMatches(state, expectedState)) {
    return clearOauthState(
      NextResponse.redirect(
        resolveOAuthReturnUrl(
          req.url,
          "/integraciones?google=invalid_state",
          process.env.GOOGLE_REDIRECT_URI
        )
      )
    );
  }

  try {
    const user = await requireStaff();
    if (!isAdmin(user)) {
      return clearOauthState(
        NextResponse.redirect(
          resolveOAuthReturnUrl(
            req.url,
            "/integraciones?google=forbidden",
            process.env.GOOGLE_REDIRECT_URI
          )
        )
      );
    }
    await exchangeGoogleCode(code);
    await connectStudyGmail(user.id);
    return clearOauthState(
      NextResponse.redirect(
        resolveOAuthReturnUrl(
          req.url,
          "/integraciones?google=connected",
          process.env.GOOGLE_REDIRECT_URI
        )
      )
    );
  } catch {
    return clearOauthState(
      NextResponse.redirect(
        resolveOAuthReturnUrl(
          req.url,
          "/integraciones?google=error",
          process.env.GOOGLE_REDIRECT_URI
        )
      )
    );
  }
}
