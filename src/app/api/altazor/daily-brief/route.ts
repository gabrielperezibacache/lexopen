import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { changeDailyBrief, dailyBriefActionSchema } from "@/lib/altazor/daily-brief";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const user = await requireStaff();
    const { action } = await parseKnowledgeBody(request, dailyBriefActionSchema, 512);
    return NextResponse.json(await changeDailyBrief(action, user), { headers });
  } catch (error) {
    const response = handleRouteError(error);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  }
}
