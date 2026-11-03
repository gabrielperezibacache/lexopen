import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { writeAuditStrict } from "@/lib/audit";
import { causaAccessWhere as scopedcausaAccessWhere } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import {
  claimMisCausasSync,
  clearClaveUnicaSyncMessages,
  getClaveUnicaStatus,
  syncMisCausas,
} from "@/lib/pjud/claveunica";
import { verifyCronSecret } from "@/lib/security/cron-secret";
import { parseMisCausasRequest } from "@/lib/pjud/mis-causas-request";
import { misCausasCapabilities } from "@/lib/pjud/mis-causas-access";
import { privatePjudJson as json, privatePjudResponse } from "@/lib/pjud/private-response";
import { after, NextRequest } from "next/server";

/** Hosts that honor this (not Cloudflare 524) get more headroom for cron. */
export const maxDuration = 300;

export async function GET() {
  try {
    const user = await requireStaff();
    const [status, causasCount] = await Promise.all([
      getClaveUnicaStatus(),
      prisma.causa.count({ where: { AND: [scopedcausaAccessWhere(user), { pjudFromMisCausas: true }] } }),
    ]);
    return json({
      status,
      causasCount,
      causas: [],
      capabilities: misCausasCapabilities(user),
    });
  } catch (e) {
    return privatePjudResponse(handleRouteError(e));
  }
}

export async function POST(req: NextRequest) {
  try {
    const cron = req.headers.get("x-cron-secret");
    let actorId: string | null = null;
    if (cron) {
      if (!verifyCronSecret(cron)) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      assertCsrf(req);
      const user = await requireStaff();
      if (!misCausasCapabilities(user).sync) {
        return json(
          {
            error:
              user.role === "asistente"
                ? "Solo abogados o admin pueden sincronizar o limpiar avisos de ClaveÚnica"
                : "La sincronización global requiere supervisión del estudio",
          },
          { status: 403 }
        );
      }
      actorId = user.id;
    }

    const body = await parseMisCausasRequest(req);

    if (body?.action === "clear_errors") {
      if (cron) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }
      const status = await clearClaveUnicaSyncMessages();
      if (actorId) {
        await writeAuditStrict({
          actorId,
          action: "pjud.mis-causas.clear_errors",
          entityType: "FirmSettings",
        });
      }
      return json({ ok: true, status });
    }

    const syncMovimientos = body?.syncMovimientos !== false;
    // Cron / explicit wait: await. UI: 202 + background (Cloudflare ~100s).
    const waitForResult = Boolean(cron) || body?.wait === true;

    if (!waitForResult) {
      const claim = await claimMisCausasSync();
      if (claim.alreadyRunning) {
        return json(
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
      after(async () => {
        try {
          const result = await syncMisCausas({
            actorId: actor,
            syncMovimientos,
            processJobsInline: false,
            claim: { settingsId: claim.settingsId, claimedAt: claim.claimedAt! },
          });
          if (actor) {
            await writeAuditStrict({
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
      });

      return json(
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
      await writeAuditStrict({
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

    return json({
      ok: true,
      ...result,
      status: await getClaveUnicaStatus(),
    });
  } catch (e) {
    return privatePjudResponse(handleRouteError(e));
  }
}
