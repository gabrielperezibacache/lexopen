import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { checkForAppUpdate } from "@/lib/update-check";

export async function GET(req: NextRequest) {
  try {
    await requireStaff();
    const force = req.nextUrl.searchParams.get("force") === "1";
    const result = await checkForAppUpdate({ force });
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
