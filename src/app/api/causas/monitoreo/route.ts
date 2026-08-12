import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import {
  listCarteraMonitoreo,
  listFallidosMonitoreo,
  providerStatusPublic,
  syncCausaPjud,
} from "@/lib/pjud/sync";
import {
  processPendingSyncJobs,
  requeueFailedJobs,
  runDueSyncPipeline,
} from "@/lib/pjud/queue";

export async function GET(req: NextRequest) {
  try {
    await requireStaff();
    const view = req.nextUrl.searchParams.get("view");
    if (view === "fallidos") {
      const fallidos = await listFallidosMonitoreo();
      return NextResponse.json({
        fallidos,
        provider: providerStatusPublic(),
      });
    }
    const items = await listCarteraMonitoreo();
    const fallidos = await listFallidosMonitoreo(20);
    const resumen = {
      total: items.length,
      monitoreadas: items.filter((i) => i.monitoreoActivo).length,
      verdes: items.filter((i) => i.semaforo === "verde").length,
      amarillas: items.filter((i) => i.semaforo === "amarillo").length,
      rojas: items.filter((i) => i.semaforo === "rojo").length,
      sinDatos: items.filter((i) => i.semaforo === "gris").length,
      fallidas: items.filter((i) => i.failed).length,
    };
    return NextResponse.json({
      items,
      fallidos,
      resumen,
      provider: providerStatusPublic(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

/** Sync due monitored causas via durable queue (cron / manual) or retry fallidos. */
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

    const body = await parseBody(
      req,
      z
        .object({
          action: z.enum(["sync", "retry-fallidos", "process-queue"]).optional(),
          causaIds: z.array(z.string().min(1).max(100)).max(100).optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .optional()
    ).catch(() => ({
      action: "sync" as const,
      causaIds: undefined,
      limit: undefined,
    }));

    if (body?.action === "retry-fallidos") {
      const requeued = await requeueFailedJobs({
        causaIds: body.causaIds,
        limit: body.limit,
      });
      const results = await processPendingSyncJobs({
        actorId,
        limit: body.limit,
      });
      if (actorId) {
        await writeAudit({
          actorId,
          action: "pjud.retry-fallidos",
          entityType: "Causa",
          after: {
            requeued: requeued.length,
            count: results.length,
            inserted: results.reduce((s, r) => s + (r.inserted || 0), 0),
          },
        });
      }
      return NextResponse.json({
        ok: true,
        requeued: requeued.length,
        synced: results.length,
        results,
        provider: providerStatusPublic(),
      });
    }

    if (body?.action === "process-queue") {
      const results = await processPendingSyncJobs({
        actorId,
        limit: body.limit,
      });
      return NextResponse.json({
        ok: true,
        synced: results.length,
        results,
        provider: providerStatusPublic(),
      });
    }

    // Explicit causaIds: sync immediately (force), still via existing sync helper
    if (body?.causaIds?.length) {
      const results = [];
      for (const id of body.causaIds.slice(0, body.limit || 50)) {
        try {
          results.push(
            await syncCausaPjud(id, {
              actorId,
              force: true,
              trigger: cron ? "cron" : "manual",
            })
          );
        } catch (e) {
          results.push({
            causaId: id,
            inserted: 0,
            skipped: 0,
            provider: "none" as const,
            demo: false,
            note: e instanceof Error ? e.message : "Error",
            status: "failed",
            jobId: null,
            lastMovimientoAt: null,
            nextSyncAt: null,
            diasSinMovimiento: null,
            semaforo: "gris" as const,
          });
        }
      }
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
    }

    const pipeline = await runDueSyncPipeline({
      actorId,
      limit: body?.limit,
    });

    if (actorId) {
      await writeAudit({
        actorId,
        action: "pjud.sync-all",
        entityType: "Causa",
        after: {
          enqueued: pipeline.enqueued,
          count: pipeline.synced,
          inserted: pipeline.results.reduce((s, r) => s + (r.inserted || 0), 0),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      enqueued: pipeline.enqueued,
      synced: pipeline.synced,
      results: pipeline.results,
      provider: providerStatusPublic(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
