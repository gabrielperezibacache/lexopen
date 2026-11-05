import { NextResponse } from "next/server";
import { readAltazorUpdates } from "@/lib/altazor/updates";
import { handleRouteError, requireStaff } from "@/lib/api";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET() {
  try {
    return NextResponse.json(await readAltazorUpdates(await requireStaff()), { headers });
  } catch (error) {
    const response = handleRouteError(error);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  }
}
