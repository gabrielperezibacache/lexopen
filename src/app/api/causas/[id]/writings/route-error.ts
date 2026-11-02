import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
export const writingHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export function writingRouteError(error: unknown) {
  const coded = error as { status?: number; code?: string; message?: string } | null;
  if (coded?.status === 409) return NextResponse.json({ error: coded.message || "No se pudo recuperar el escrito", code: coded.code || "writing_source_unavailable" }, { status: 409, headers: writingHeaders });
  const response = handleRouteError(error);
  for (const [key, value] of Object.entries(writingHeaders)) response.headers.set(key, value);
  return response;
}
