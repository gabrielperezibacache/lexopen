import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/integrations/google";
import { requireStaff } from "@/lib/api";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get("google_oauth_state")?.value;

  if (error) {
    return NextResponse.redirect(
      new URL(`/integraciones?google=error&msg=${encodeURIComponent(error)}`, req.url)
    );
  }
  if (!code) {
    return NextResponse.redirect(new URL("/integraciones?google=missing_code", req.url));
  }
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/integraciones?google=invalid_state", req.url));
  }

  try {
    await requireStaff();
    await exchangeGoogleCode(code);
    const res = NextResponse.redirect(new URL("/integraciones?google=connected", req.url));
    res.cookies.delete("google_oauth_state");
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.redirect(
      new URL(`/integraciones?google=error&msg=${encodeURIComponent(msg)}`, req.url)
    );
  }
}
