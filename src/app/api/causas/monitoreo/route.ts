import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import {
  listCarteraMonitoreo,
  providerStatusPublic,
  syncCausaPjud,
} from "@/lib/pjud/sync";
import { prisma } from "@/lib/db";
import { mapWithConcurrency } from "@/lib/pjud/concurrency";

export async function GET() {
  try {
    await requireStaff();
    const items = await listCarteraMonitoreo();
    const resumen = {
      total: items.length,
      monitoreadas: items.filter((i) => i.monitoreoActivo).length,
      verdes: items.filter((i) => i.semaforo === "verde").length,
      amarillas: items.filter((i) => i.semaforo === "amarillo").length,
      rojas: items.filter((i) => i.semaforo === "rojo").length,
      sinDatos: items.filter((i) => i.semaforo === "gris").length,
    };
    return NextResponse.json({
      items,
      resumen,
      provider: providerStatusPublic(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

/** Sync all actively monitored causas (cron / manual). */
export async function POST(req: NextRequest) {
  try {
    const cron = req.headers.get("x-cron-secret");
    let actorId: string | null = null;
    if (cron) {
      if (!process.env.CRON_SECRET || cron !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      assertCsrf(req);
      const user = await requireStaff();
      actorId = user.id;
    }

    const activas = await prisma.causa.findMany({
      where: { pjudMonitoreoActivo: true, estado: "activa" },
      select: { id: true },
      take: 500,
    });

    const results = await mapWithConcurrency(activas, 3, async (c) => {
      try {
        return await syncCausaPjud(c.id, { actorId, force: true });
      } catch (e) {
        return {
          causaId: c.id,
          inserted: 0,
          skipped: 0,
          provider: "none" as const,
          demo: false,
          note: e instanceof Error ? e.message : "Error",
          status: "error",
          lastMovimientoAt: null,
          diasSinMovimiento: null,
          semaforo: "gris" as const,
        };
      }
    });

    if (actorId) {
      await writeAudit({
        actorId,
        action: "pjud.sync-all",
        entityType: "Causa",
        after: {
          count: results.length,
          inserted: results.reduce((s, r) => s + (r.inserted || 0), 0),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      synced: results.length,
      results,
      provider: providerStatusPublic(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
