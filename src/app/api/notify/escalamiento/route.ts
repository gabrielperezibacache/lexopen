import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireRole } from "@/lib/api";
import { verifyCronSecret } from "@/lib/security/cron-secret";
import {
  processPlazoEscalamiento,
  processPlazoHitos,
} from "@/lib/notify/plazos";

function authorizedByCron(req: NextRequest) {
  const header =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return verifyCronSecret(header);
}

/** Hitos de plazo + escalamiento sin acuse (cada ~15 min). */
export async function POST(req: NextRequest) {
  try {
    if (!authorizedByCron(req)) {
      assertCsrf(req);
      await requireRole("admin");
    }
    const hitos = await processPlazoHitos();
    const escalamiento = await processPlazoEscalamiento();
    return NextResponse.json({ ok: true, hitos, escalamiento });
  } catch (e) {
    return handleRouteError(e);
  }
}
