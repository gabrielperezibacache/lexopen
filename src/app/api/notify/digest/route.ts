import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireRole } from "@/lib/api";
import { verifyCronSecret } from "@/lib/security/cron-secret";
import { processDigests } from "@/lib/notify/digest";

function authorizedByCron(req: NextRequest) {
  const header =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return verifyCronSecret(header);
}

export async function POST(req: NextRequest) {
  try {
    if (!authorizedByCron(req)) {
      assertCsrf(req);
      await requireRole("admin");
    }
    const mode =
      req.nextUrl.searchParams.get("mode") === "semanal" ? "semanal" : "diario";
    const result = await processDigests({ mode });
    return NextResponse.json({ ok: true, mode, ...result });
  } catch (e) {
    return handleRouteError(e);
  }
}
