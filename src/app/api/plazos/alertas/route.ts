import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { verifyCronSecret } from "@/lib/security/cron-secret";
import {
  processPlazoEscalamiento,
  processPlazoHitos,
} from "@/lib/notify/plazos";
import { processOutboxBatch } from "@/lib/notify/worker";

function authorizedByCron(req: NextRequest) {
  const header =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return verifyCronSecret(header);
}

/**
 * Genera hitos de plazo (T-7…T-0), escala sin acuse y drena el outbox.
 * Sustituye el camino legacy createPlazoAlerts + Gmail directo.
 */
export async function POST(req: NextRequest) {
  try {
    if (!authorizedByCron(req)) {
      assertCsrf(req);
      await requireStaff();
    }

    const daysParam = Number(req.nextUrl.searchParams.get("days") || "8");
    const days = Number.isFinite(daysParam)
      ? Math.max(0, Math.min(30, Math.trunc(daysParam)))
      : 8;

    const hitos = await processPlazoHitos({ lookAheadDays: days });
    const escalamiento = await processPlazoEscalamiento();
    const outbox =
      process.env.NOTIFY_WORKER === "0"
        ? { claimed: 0, sent: 0, failed: 0, dead: 0, skipped: true }
        : await processOutboxBatch({ limit: 40 });

    return NextResponse.json({
      ok: true,
      days,
      plazos: hitos.plazos,
      generated: hitos.generated,
      notifications: hitos.notifications,
      escalamiento,
      outbox,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
