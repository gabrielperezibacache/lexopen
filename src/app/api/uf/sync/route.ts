import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireRole } from "@/lib/api";
import { syncUfFromMindicador } from "@/lib/uf-sync";
import { verifyCronSecret } from "@/lib/security/cron-secret";

/** Manual (admin) or cron-triggered UF sync from mindicador.cl */
export async function POST(req: NextRequest) {
  try {
    const cronOk = verifyCronSecret(req.headers.get("x-cron-secret"));
    if (!cronOk) {
      assertCsrf(req);
      await requireRole("admin");
    }
    const result = await syncUfFromMindicador({ days: 45 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return handleRouteError(e);
  }
}
