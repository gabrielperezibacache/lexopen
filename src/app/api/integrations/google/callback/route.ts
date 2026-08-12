import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/integrations/google";
import { requireStaff } from "@/lib/api";

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
  res.cookies.delete("google_oauth_state");
  return res;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get("google_oauth_state")?.value;

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
    await requireStaff();
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
