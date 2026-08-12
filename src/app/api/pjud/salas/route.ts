import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import {
  applySalaMatchesToCartera,
  demoSalasTablaHtml,
  parseSalasTablaHtml,
} from "@/lib/pjud/salas";
import { providerStatusPublic } from "@/lib/pjud/sync";

/** Preview / sync de programación de salas (paridad CausaMonitor). */
export async function GET() {
  try {
    await requireStaff();
    return NextResponse.json({
      provider: providerStatusPublic(),
      sampleHtml: demoSalasTablaHtml(),
      hint: "POST { html } o { demo: true } para cruzar RITs monitoreados con tablas de Corte.",
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    await requireStaff();
    const body = await parseBody(
      req,
      z.object({
        html: z.string().max(2_000_000).optional(),
        demo: z.boolean().optional(),
        corteDefault: z.string().max(200).optional(),
        causaIds: z.array(z.string().min(1)).max(200).optional(),
        dryRun: z.boolean().optional(),
      })
    );

    const html =
      body.html?.trim() ||
      (body.demo
        ? demoSalasTablaHtml({ corte: body.corteDefault })
        : "");
    if (!html) {
      return NextResponse.json(
        { error: "html o demo=true requerido" },
        { status: 400 }
      );
    }

    const agenda = parseSalasTablaHtml(html, {
      corteDefault: body.corteDefault,
    });
    if (body.dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        agenda: agenda.slice(0, 50),
        count: agenda.length,
        provider: providerStatusPublic(),
      });
    }

    const result = await applySalaMatchesToCartera(agenda, {
      causaIds: body.causaIds,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      agendaCount: agenda.length,
      provider: providerStatusPublic(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
