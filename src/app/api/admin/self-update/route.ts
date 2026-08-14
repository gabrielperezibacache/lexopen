import { NextRequest, NextResponse } from "next/server";
import {
  assertCsrf,
  handleRouteError,
  requireRole,
} from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import {
  getSelfUpdateCapability,
  readSelfUpdateStatus,
  requestSelfUpdate,
} from "@/lib/self-update";
import { checkForAppUpdate } from "@/lib/update-check";

export async function GET() {
  try {
    await requireRole("admin");
    const [status, capability, update] = await Promise.all([
      Promise.resolve(readSelfUpdateStatus()),
      Promise.resolve(getSelfUpdateCapability()),
      checkForAppUpdate().catch(() => null),
    ]);
    return NextResponse.json(
      {
        ...status,
        capability,
        updateAvailable: Boolean(update?.updateAvailable),
        latestVersion: update?.latestVersion ?? null,
        releaseUrl: update?.releaseUrl ?? null,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireRole("admin");
    const limited = await rateLimitAsync(
      `self-update:${user.id}`,
      3,
      60 * 60 * 1000
    );
    if (!limited.ok) {
      return NextResponse.json(
        {
          error:
            "Demasiados intentos de actualización. Espere un momento e intente de nuevo.",
          code: "rate_limited",
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "start");
    if (action !== "start") {
      return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
    }

    const update = await checkForAppUpdate({ force: true }).catch(() => null);
    const status = requestSelfUpdate({
      actorId: user.id,
      targetVersion: update?.latestVersion || body.targetVersion || null,
    });

    await writeAudit({
      action: "host.self_update",
      entityType: "host",
      entityId: "self-update",
      actorId: user.id,
      after: {
        fromVersion: status.fromVersion,
        targetVersion: update?.latestVersion || null,
        webHostManaged: status.webHostManaged,
      },
    }).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      status,
      latestVersion: update?.latestVersion ?? null,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
