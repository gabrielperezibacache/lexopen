import { NextResponse } from "next/server";
import { handleRouteError, requireRole } from "@/lib/api";
import { getConfigSnapshot } from "@/lib/config-snapshot";

export async function GET() {
  try {
    await requireRole("admin");
    return NextResponse.json(await getConfigSnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
