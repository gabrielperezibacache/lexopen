import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/integrations/google";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/integraciones?google=error&msg=${encodeURIComponent(error)}`, req.url)
    );
  }
  if (!code) {
    return NextResponse.redirect(new URL("/integraciones?google=missing_code", req.url));
  }

  try {
    await exchangeGoogleCode(code);
    return NextResponse.redirect(new URL("/integraciones?google=connected", req.url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.redirect(
      new URL(`/integraciones?google=error&msg=${encodeURIComponent(msg)}`, req.url)
    );
  }
}
