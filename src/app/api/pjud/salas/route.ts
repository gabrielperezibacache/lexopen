import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import {
  applySalaMatchesToCartera,
  demoSalasTablaHtml,
  parseSalasTablaHtml,
} from "@/lib/pjud/salas";
import { fetchSalasPortalHtml } from "@/lib/pjud/online-probe";
import { providerStatusPublic } from "@/lib/pjud/sync";

/** Preview / sync de programación de salas (paridad CausaMonitor). */
export async function GET() {
  try {
    await requireStaff();
    return NextResponse.json({
      provider: providerStatusPublic(),
      sampleHtml: demoSalasTablaHtml(),
      hint: "POST { html } | { demo: true } | { source: 'live' } para cruzar RITs con tablas de Corte.",
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
        source: z.enum(["live", "html", "demo"]).optional(),
        salasUrl: z.string().url().max(500).optional(),
        corteDefault: z.string().max(200).optional(),
        causaIds: z.array(z.string().min(1)).max(200).optional(),
        dryRun: z.boolean().optional(),
      })
    );

    let html = body.html?.trim() || "";
    let liveMeta: {
      restricted?: boolean;
      status?: number | null;
      url?: string;
    } | null = null;

    if (!html && (body.source === "live" || body.salasUrl)) {
      const fetched = await fetchSalasPortalHtml({ url: body.salasUrl });
      liveMeta = {
        restricted: fetched.restricted,
        status: fetched.status,
        url: fetched.url,
      };
      if (fetched.restricted) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Portal de salas restringido desde este host. Pegue HTML (source html) o use demo=true.",
            live: liveMeta,
          },
          { status: 502 }
        );
      }
      html = fetched.html;
    } else if (!html && (body.demo || body.source === "demo")) {
      html = demoSalasTablaHtml({ corte: body.corteDefault });
    }

    if (!html) {
      return NextResponse.json(
        { error: "html, demo=true o source=live requerido" },
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
        live: liveMeta,
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
      live: liveMeta,
      provider: providerStatusPublic(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
