import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
export const liveHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export function liveRouteError(error: unknown) {
  const candidate = error as { code?: string; status?: number; message?: string };
  if (candidate?.code?.startsWith("hearing_live_") && candidate.status) return NextResponse.json({ error: candidate.message, code: candidate.code }, { status: candidate.status, headers: liveHeaders });
  const response = handleRouteError(error);
  for (const [key, value] of Object.entries(liveHeaders)) response.headers.set(key, value);
  return response;
}
export type LiveContext = { params: Promise<{ id: string; workspaceId: string }> };
