import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { askHermes, getHermesConfig, legalSystemPrompt } from "@/lib/integrations/hermes";

export async function GET() {
  const row = await prisma.integrationConfig.findUnique({ where: { provider: "hermes" } });
  const config = await getHermesConfig();
  return NextResponse.json({
    enabled: row?.enabled ?? false,
    config: { ...config, apiKey: config.apiKey ? "••••" : "" },
  });
}

export async function POST(req: Request) {
  const body = await req.json();

  if (body.action === "save-config") {
    await prisma.integrationConfig.upsert({
      where: { provider: "hermes" },
      create: {
        provider: "hermes",
        enabled: Boolean(body.enabled ?? true),
        configJson: JSON.stringify(body.config || {}),
      },
      update: {
        enabled: Boolean(body.enabled ?? true),
        configJson: JSON.stringify(body.config || {}),
      },
    });
    return NextResponse.json({ ok: true });
  }

  let context = "";
  if (body.causaId) {
    const causa = await prisma.causa.findUnique({
      where: { id: body.causaId },
      include: {
        partes: true,
        plazos: true,
        minutas: {
          include: { acciones: true },
          orderBy: { fecha: "desc" },
          take: 5,
        },
      },
    });
    if (causa) {
      context = JSON.stringify(
        {
          titulo: causa.titulo,
          rit: causa.rit,
          tribunal: causa.tribunal,
          materia: causa.materia,
          etapa: causa.etapa,
          caratula: causa.caratula,
          resumen: causa.resumen,
          googleDriveFolder: causa.googleDriveFolderUrl,
          partes: causa.partes,
          plazos: causa.plazos.map((p) => ({
            titulo: p.titulo,
            fecha: p.fechaLimite,
            estado: p.estado,
          })),
          minutasRecientes: causa.minutas.map((m) => ({
            tipo: m.tipo,
            titulo: m.titulo,
            fecha: m.fecha,
            resumen: m.resumenEjecutivo,
            proximosPasos: m.acciones.map((a) => ({
              descripcion: a.descripcion,
              estado: a.estado,
              responsable: a.responsable,
            })),
          })),
        },
        null,
        2
      );
    }
  }

  const result = await askHermes({
    causaId: body.causaId,
    userId: body.userId,
    messages: [
      { role: "system", content: legalSystemPrompt(context) },
      { role: "user", content: body.prompt || "Resume el estado procesal y sugiere próximos pasos." },
    ],
  });

  return NextResponse.json(result);
}
