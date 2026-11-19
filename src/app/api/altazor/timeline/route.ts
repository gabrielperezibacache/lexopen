import { NextResponse } from "next/server";
import { readAltazorTimeline } from "@/lib/altazor/timeline";
import { handleRouteError, requireStaff } from "@/lib/api";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    return NextResponse.json(await readAltazorTimeline(await requireStaff(), query.get("before"), undefined, query.get("through")), { headers });
  } catch (error) {
    const response = handleRouteError(error);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  }
}
