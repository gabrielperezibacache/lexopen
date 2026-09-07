import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { verifyCronSecret } from "@/lib/security/cron-secret";
import { startOfDay } from "@/lib/plazos";
import { createPlazoAlerts, escapeAlertHtml } from "@/lib/plazo-alerts";
import { getGoogleConfig } from "@/lib/integrations/google";
import { sendGmailMessage } from "@/lib/integrations/gmail";

function authorizedByCron(req: NextRequest) {
  const header =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return verifyCronSecret(header);
}

function emailAlertasEnabled() {
  return process.env.PLAZOS_ALERTAS_EMAIL === "1";
}

/** Genera notificaciones (y opcionalmente email) para plazos próximos. */
export async function POST(req: NextRequest) {
  try {
    if (!authorizedByCron(req)) {
      assertCsrf(req);
      await requireStaff();
    }

    const daysParam = Number(req.nextUrl.searchParams.get("days") || "3");
    const days = Number.isFinite(daysParam)
      ? Math.max(0, Math.min(30, Math.trunc(daysParam)))
      : 3;
    const from = startOfDay(new Date());
    const until = startOfDay(
      new Date(from.getTime() + days * 24 * 60 * 60 * 1000)
    );

    const { plazos, notifications, emailBuckets } = await createPlazoAlerts(prisma, {
      from, until, emailEnabled: emailAlertasEnabled(),
    });

    let emailed = 0;
    let emailFailed = 0;
    if (emailAlertasEnabled() && emailBuckets.size > 0) {
      const google = await getGoogleConfig();
      if (!google.accessToken) {
        emailFailed = emailBuckets.size;
      } else {
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
        for (const bucket of emailBuckets.values()) {
          const text = [
            `Hola ${bucket.name},`,
            "",
            "Plazos próximos en LexOpen:",
            "",
            ...bucket.lines,
            "",
            appUrl ? `Abrir: ${appUrl}/plazos` : "Revise /plazos en LexOpen.",
          ].join("\n");
          try {
            await sendGmailMessage({
              to: bucket.email,
              subject: `LexOpen · ${bucket.lines.length} plazo(s) próximo(s)`,
              text,
              html: `<p>Hola ${escapeAlertHtml(bucket.name)},</p><p>Plazos próximos en LexOpen:</p><ul>${bucket.lines
                .map((l) => `<li>${escapeAlertHtml(l.replace(/^•\s*/, ""))}</li>`)
                .join("")}</ul>${
                appUrl
                  ? `<p><a href="${escapeAlertHtml(appUrl)}/plazos">Abrir plazos</a></p>`
                  : ""
              }`,
            });
            emailed += 1;
          } catch {
            emailFailed += 1;
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      days,
      plazos,
      notifications,
      emailed,
      emailFailed,
      emailEnabled: emailAlertasEnabled(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
