import { NextResponse } from "next/server";
import { handleRouteError, requireRole } from "@/lib/api";
import { getHostStatus } from "@/lib/host-status";

export async function GET() {
  try {
    await requireRole("admin");
    return NextResponse.json(await getHostStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
