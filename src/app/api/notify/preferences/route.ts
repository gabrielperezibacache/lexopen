import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireUser,
} from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  CATALOGO,
  EXTERNAL_CHANNELS,
  isExternalChannel,
  isModo,
  isNivelDetalle,
  isTipo,
} from "@/lib/notify/catalog";
import { isValidHhmm } from "@/lib/notify/time";
import { loadPerfil, loadPrefs } from "@/lib/notify/channels";
import { DEFAULT_PERFIL, modoPara } from "@/lib/notify/preferences";

export async function GET() {
  try {
    const user = await requireUser();
    const [prefs, perfil, canales] = await Promise.all([
      loadPrefs(user.id),
      loadPerfil(user.id),
      prisma.canalUsuario.findMany({
        where: { userId: user.id, estado: { in: ["activo", "pendiente", "bloqueado"] } },
        select: {
          id: true,
          canal: true,
          estado: true,
          nivelDetalle: true,
          verificadoAt: true,
          etiqueta: true,
        },
      }),
    ]);

    const matriz = Object.keys(CATALOGO).map((tipo) => ({
      tipo,
      label: CATALOGO[tipo as keyof typeof CATALOGO].label,
      apagable: CATALOGO[tipo as keyof typeof CATALOGO].apagable,
      canales: Object.fromEntries(
        EXTERNAL_CHANNELS.map((canal) => [canal, modoPara(tipo, canal, prefs)])
      ),
    }));

    return NextResponse.json({
      perfil,
      matriz,
      canales,
      catalogo: CATALOGO,
      email: user.email,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

const prefSchema = z.object({
  prefs: z
    .array(
      z.object({
        tipo: z.string(),
        canal: z.string(),
        modo: z.string(),
      })
    )
    .optional(),
  perfil: z
    .object({
      quietDesde: z.string().optional(),
      quietHasta: z.string().optional(),
      quietFinesSemana: z.boolean().optional(),
      zonaHoraria: z.string().optional(),
      nivelEmail: z.string().optional(),
      silenciadoHasta: z.string().nullable().optional(),
    })
    .optional(),
});

export async function PUT(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireUser();
    const body = await parseBody(req, prefSchema);

    if (body.perfil) {
      const quietDesde = body.perfil.quietDesde || DEFAULT_PERFIL.quietDesde;
      const quietHasta = body.perfil.quietHasta || DEFAULT_PERFIL.quietHasta;
      if (!isValidHhmm(quietDesde) || !isValidHhmm(quietHasta)) {
        return NextResponse.json(
          { error: "Horas de silencio inválidas (HH:MM)" },
          { status: 400 }
        );
      }
      const nivelEmail = body.perfil.nivelEmail || DEFAULT_PERFIL.nivelEmail;
      if (!isNivelDetalle(nivelEmail)) {
        return NextResponse.json({ error: "nivelEmail inválido" }, { status: 400 });
      }
      await prisma.perfilNotificacion.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          quietDesde,
          quietHasta,
          quietFinesSemana: body.perfil.quietFinesSemana ?? true,
          zonaHoraria: body.perfil.zonaHoraria || "America/Santiago",
          nivelEmail,
          silenciadoHasta: body.perfil.silenciadoHasta
            ? new Date(body.perfil.silenciadoHasta)
            : null,
        },
        update: {
          quietDesde,
          quietHasta,
          quietFinesSemana: body.perfil.quietFinesSemana ?? true,
          zonaHoraria: body.perfil.zonaHoraria || "America/Santiago",
          nivelEmail,
          silenciadoHasta:
            body.perfil.silenciadoHasta === null
              ? null
              : body.perfil.silenciadoHasta
                ? new Date(body.perfil.silenciadoHasta)
                : undefined,
        },
      });
    }

    if (body.prefs) {
      for (const p of body.prefs) {
        if (!isExternalChannel(p.canal) && p.canal !== "inapp") continue;
        if (!isModo(p.modo)) continue;
        if (p.tipo !== "*" && !isTipo(p.tipo)) continue;
        const def = p.tipo === "*" ? null : CATALOGO[p.tipo as keyof typeof CATALOGO];
        if (def && !def.apagable && p.modo === "off") {
          // Críticos: no se apagan; se ignora off.
          continue;
        }
        await prisma.preferenciaNotificacion.upsert({
          where: {
            userId_tipo_canal: {
              userId: user.id,
              tipo: p.tipo,
              canal: p.canal,
            },
          },
          create: {
            userId: user.id,
            tipo: p.tipo,
            canal: p.canal,
            modo: p.modo,
          },
          update: { modo: p.modo },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
