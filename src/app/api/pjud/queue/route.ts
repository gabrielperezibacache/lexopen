import { NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { getPjudQueueStatus, pjudSyncConcurrency } from "@/lib/pjud/queue";
import { providerStatusPublic } from "@/lib/pjud/sync";

/**
 * Stats de cola PJUD — paridad con CausaMonitor `GET /api/queue/stats`
 * + health worker (`worker.concurrency`).
 */
export async function GET() {
  try {
    await requireStaff();
    const queue = await getPjudQueueStatus();
    return NextResponse.json(
      {
        // Bull / CausaMonitor shape
        waiting: queue.waiting,
        active: queue.active,
        completed: queue.completed,
        failed: queue.failed,
        delayed: queue.delayed,
        worker: {
          running: true,
          concurrency: pjudSyncConcurrency(),
        },
        provider: providerStatusPublic(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
