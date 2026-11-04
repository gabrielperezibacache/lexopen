import { handleRouteError, requireStaff } from "@/lib/api";
import { getPjudQueueStatus, pjudSyncConcurrency } from "@/lib/pjud/queue";
import { providerStatusPublic } from "@/lib/pjud/sync";
import { getPjudSchedulerConfiguration } from "@/lib/pjud/scheduler-status";
import { privatePjudJson, privatePjudResponse } from "@/lib/pjud/private-response";

/**
 * Stats de cola PJUD — paridad con CausaMonitor `GET /api/queue/stats`
 * + health worker (`worker.concurrency`).
 */
export async function GET() {
  try {
    const user = await requireStaff();
    const queue = await getPjudQueueStatus(user);
    return privatePjudJson(
      {
        // Bull / CausaMonitor shape
        waiting: queue.waiting,
        active: queue.active,
        completed: queue.completed,
        failed: queue.failed,
        partial: queue.partial,
        delayed: queue.delayed,
        worker: {
          // Compatibility flag, not a heartbeat from the parent Host process.
          running: true,
          runningVerified: false,
          state: "unverified",
          concurrency: pjudSyncConcurrency(),
        },
        provider: providerStatusPublic(),
        scheduler: getPjudSchedulerConfiguration(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return privatePjudResponse(handleRouteError(e));
  }
}
