import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import {
  claimMisCausasSync,
  clearClaveUnicaSyncMessages,
  getClaveUnicaStatus,
  syncMisCausas,
} from "@/lib/pjud/claveunica";
import { verifyCronSecret } from "@/lib/security/cron-secret";

/** Hosts that honor this (not Cloudflare 524) get more headroom for cron. */
export const maxDuration = 300;

export async function GET() {
  try {
    await requireStaff();
    return NextResponse.json({
      status: await getClaveUnicaStatus(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

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
          action: z.enum(["sync", "clear_errors"]).optional(),
          syncMovimientos: z.boolean().optional(),
          /** Dev/ops only: wait for full sync in this request (can 524 behind CF). */
          wait: z.boolean().optional(),
        })
        .optional()
    ).catch(() => ({
      action: "sync" as const,
      syncMovimientos: true as boolean | undefined,
      wait: false as boolean | undefined,
    }));

    if (body?.action === "clear_errors") {
      if (cron) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const status = await clearClaveUnicaSyncMessages();
      if (actorId) {
        await writeAudit({
          actorId,
          action: "pjud.mis-causas.clear_errors",
          entityType: "FirmSettings",
        });
      }
      return NextResponse.json({ ok: true, status });
    }

    const syncMovimientos = body?.syncMovimientos !== false;
    // Cron / explicit wait: await. UI: 202 + background (Cloudflare ~100s).
    const waitForResult = Boolean(cron) || body?.wait === true;

    if (!waitForResult) {
      const claim = await claimMisCausasSync();
      if (claim.alreadyRunning) {
        return NextResponse.json(
          {
            ok: true,
            async: true,
            started: false,
            status: await getClaveUnicaStatus(),
          },
          { status: 202 }
        );
      }

      const actor = actorId;
      void (async () => {
        try {
          const result = await syncMisCausas({
            actorId: actor,
            syncMovimientos,
            processJobsInline: false,
            alreadyClaimed: true,
          });
          if (actor) {
            await writeAudit({
              actorId: actor,
              action: "pjud.mis-causas.sync",
              entityType: "FirmSettings",
              after: {
                listed: result.listed,
                created: result.created,
                linked: result.linked,
                enqueued: result.enqueued,
                async: true,
              },
            });
          }
        } catch (error) {
          console.error(
            "[pjud/mis-causas] background sync failed:",
            error instanceof Error ? error.message : error
          );
        }
      })();

      return NextResponse.json(
        {
          ok: true,
          async: true,
          started: true,
          status: await getClaveUnicaStatus(),
        },
        { status: 202 }
      );
    }

    const result = await syncMisCausas({
      actorId,
      syncMovimientos,
      processJobsInline: false,
    });

    if (actorId) {
      await writeAudit({
        actorId,
        action: "pjud.mis-causas.sync",
        entityType: "FirmSettings",
        after: {
          listed: result.listed,
          created: result.created,
          linked: result.linked,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      ...result,
      status: await getClaveUnicaStatus(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
