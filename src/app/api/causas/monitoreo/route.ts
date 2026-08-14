import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { verifyCronSecret } from "@/lib/security/cron-secret";
import { downloadResponseHeaders } from "@/lib/security/download";
import { writeAudit } from "@/lib/audit";
import {
  clearFallidosMonitoreoAvisos,
  listCarteraMonitoreo,
  listFallidosMonitoreo,
  providerStatusPublicAsync,
  syncCausaPjud,
} from "@/lib/pjud/sync";
import {
  processPendingSyncJobs,
  requeueFailedJobs,
  runDueSyncPipeline,
  getPjudQueueStatus,
} from "@/lib/pjud/queue";
import {
  CsvImportError,
  parseCausasCsv,
  serializeCausasCsv,
} from "@/lib/pjud/import-csv";
import { addCausaByRol } from "@/lib/pjud/lookup";

export async function GET(req: NextRequest) {
  try {
    await requireStaff();
    const view = req.nextUrl.searchParams.get("view");
    if (view === "fallidos") {
      const fallidos = await listFallidosMonitoreo();
      return NextResponse.json({
        fallidos,
        provider: await providerStatusPublicAsync(),
      });
    }
    const items = await listCarteraMonitoreo();
    const format = req.nextUrl.searchParams.get("format");
    if (format === "csv") {
      const csv = serializeCausasCsv(
        items.map((i) => ({
          rit: i.rit,
          tribunal: i.tribunal,
          titulo: i.titulo,
          ruc: i.ruc,
          materia: i.materia,
        }))
      );
      return new NextResponse(csv, {
        headers: downloadResponseHeaders("cartera-pjud.csv", "text/csv"),
      });
    }
    const fallidos = await listFallidosMonitoreo(20);
    const queue = await getPjudQueueStatus().catch(() => null);
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
      queue,
      provider: await providerStatusPublicAsync(),
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
      if (!verifyCronSecret(cron)) {
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
          action: z
            .enum([
              "sync",
              "retry-fallidos",
              "clear-errors",
              "process-queue",
              "import-cartera",
            ])
            .optional(),
          causaIds: z.array(z.string().min(1).max(100)).max(100).optional(),
          limit: z.number().int().min(1).max(200).optional(),
          csv: z.string().max(5_000_000).optional(),
          syncNow: z.boolean().optional(),
        })
        .optional()
    ).catch(() => ({
      action: "sync" as const,
      causaIds: undefined,
      limit: undefined,
      csv: undefined,
      syncNow: undefined,
    }));

    if (body?.action === "import-cartera") {
      if (!body.csv?.trim()) {
        return NextResponse.json(
          { error: "CSV requerido (rit,tribunal,…)" },
          { status: 400 }
        );
      }
      let rows;
      try {
        rows = parseCausasCsv(body.csv);
      } catch (error) {
        if (error instanceof CsvImportError) {
          return NextResponse.json(
            { error: error.message },
            { status: error.status }
          );
        }
        throw error;
      }
      const results = [];
      for (const row of rows.slice(0, body.limit || 200)) {
        try {
          results.push(
            await addCausaByRol({
              rit: row.rit,
              tribunal: row.tribunal,
              titulo: row.titulo || undefined,
              ruc: row.ruc || null,
              materia: row.materia || undefined,
              actorId,
              syncNow: body.syncNow === true,
            })
          );
        } catch (e) {
          results.push({
            causaId: "",
            created: false,
            sync: null,
            note: e instanceof Error ? e.message : "Error",
            rit: row.rit,
            tribunal: row.tribunal,
          });
        }
      }
      if (actorId) {
        await writeAudit({
          actorId,
          action: "pjud.import-cartera",
          entityType: "Causa",
          after: {
            rows: rows.length,
            created: results.filter((r) => r.created).length,
          },
        });
      }
      return NextResponse.json({
        ok: true,
        imported: results.length,
        created: results.filter((r) => r.created).length,
        results,
        provider: await providerStatusPublicAsync(),
      });
    }

    if (body?.action === "clear-errors") {
      if (cron) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const cleared = await clearFallidosMonitoreoAvisos({
        causaIds: body.causaIds,
        limit: body.limit,
      });
      if (actorId) {
        await writeAudit({
          actorId,
          action: "pjud.clear-fallidos",
          entityType: "Causa",
          after: cleared,
        });
      }
      return NextResponse.json({
        ok: true,
        ...cleared,
        fallidos: await listFallidosMonitoreo(20),
        provider: await providerStatusPublicAsync(),
      });
    }

    if (body?.action === "retry-fallidos") {
      const requeued = await requeueFailedJobs({
        causaIds: body.causaIds,
        limit: body.limit,
      });
      const results = await processPendingSyncJobs({
        actorId,
        limit: body.limit,
        jobIds: requeued.map((j) => j.id),
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
        provider: await providerStatusPublicAsync(),
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
        provider: await providerStatusPublicAsync(),
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
        provider: await providerStatusPublicAsync(),
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
      provider: await providerStatusPublicAsync(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
