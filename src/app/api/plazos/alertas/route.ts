import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { verifyCronSecret } from "@/lib/security/cron-secret";
import { startOfDay } from "@/lib/plazos";
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

    const plazos = await prisma.plazo.findMany({
      where: {
        estado: "pendiente",
        alertaEnviada: false,
        fechaLimite: { gte: from, lte: until },
      },
      include: {
        responsable: { select: { id: true, email: true, name: true } },
        causa: {
          select: {
            id: true,
            titulo: true,
            rit: true,
            abogadoId: true,
            abogado: { select: { id: true, email: true, name: true } },
          },
        },
      },
      orderBy: { fechaLimite: "asc" },
      take: 100,
    });

    let notifications = 0;
    const emailBuckets = new Map<
      string,
      { email: string; name: string; lines: string[] }
    >();

    for (const plazo of plazos) {
      const recipients = new Map<
        string,
        { id: string; email: string | null; name: string | null }
      >();
      if (plazo.responsable?.id) {
        recipients.set(plazo.responsable.id, plazo.responsable);
      }
      if (plazo.causa?.abogadoId && plazo.causa.abogado) {
        recipients.set(plazo.causa.abogadoId, plazo.causa.abogado);
      }
      if (recipients.size === 0) continue;

      const title = `Plazo próximo · ${plazo.causa?.rit || plazo.causa?.titulo || "sin causa"}`;
      const body = `${plazo.titulo} vence el ${plazo.fechaLimite.toISOString().slice(0, 10)}.`;
      const href = plazo.causaId ? `/causas/${plazo.causaId}` : "/plazos";

      await prisma.notification.createMany({
        data: [...recipients.keys()].map((userId) => ({
          userId,
          title,
          body,
          href,
        })),
      });
      notifications += recipients.size;

      if (emailAlertasEnabled()) {
        for (const user of recipients.values()) {
          if (!user.email) continue;
          const bucket = emailBuckets.get(user.email) || {
            email: user.email,
            name: user.name || user.email,
            lines: [],
          };
          bucket.lines.push(`• ${title}: ${body}`);
          emailBuckets.set(user.email, bucket);
        }
      }

      await prisma.plazo.update({
        where: { id: plazo.id },
        data: { alertaEnviada: true },
      });
    }

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
              html: `<p>Hola ${bucket.name},</p><p>Plazos próximos en LexOpen:</p><ul>${bucket.lines
                .map((l) => `<li>${l.replace(/^•\s*/, "")}</li>`)
                .join("")}</ul>${
                appUrl
                  ? `<p><a href="${appUrl}/plazos">Abrir plazos</a></p>`
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
      plazos: plazos.length,
      notifications,
      emailed,
      emailFailed,
      emailEnabled: emailAlertasEnabled(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
