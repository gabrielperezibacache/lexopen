import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, requireStaff } from "@/lib/api";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { askHermes, getHermesConfig, legalSystemPrompt } from "@/lib/integrations/hermes";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const causaId = req.nextUrl.searchParams.get("causaId");
    if (req.nextUrl.searchParams.get("chats") === "1" || causaId) {
      const chats = await prisma.agentChat.findMany({
        where: {
          ...(causaId ? { causaId } : {}),
          ...(user.role === "admin" ? {} : { userId: user.id }),
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
      return NextResponse.json(chats);
    }

    const row = await prisma.integrationConfig.findUnique({ where: { provider: "hermes" } });
    const config = await getHermesConfig();
    return NextResponse.json({
      enabled: row?.enabled ?? false,
      config: { ...config, apiKey: config.apiKey ? "••••" : "" },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireStaff();
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
            where: canSeeConfidential(user.role) ? {} : { confidencial: false },
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
      userId: body.userId || user.id,
      messages: [
        { role: "system", content: legalSystemPrompt(context) },
        { role: "user", content: body.prompt || "Resume el estado procesal y sugiere próximos pasos." },
      ],
    });

    const prompt = body.prompt || "Resume el estado procesal y sugiere próximos pasos.";
    const nextMessages = [
      { role: "user", content: prompt },
      { role: "assistant", content: result.content, source: result.source },
    ];
    if (body.chatId) {
      const existing = await prisma.agentChat.findUnique({ where: { id: body.chatId } });
      const previous = existing ? JSON.parse(existing.messagesJson || "[]") : [];
      await prisma.agentChat.update({
        where: { id: body.chatId },
        data: {
          messagesJson: JSON.stringify([...previous, ...nextMessages]),
          demoMode: existing?.demoMode || result.source === "demo",
          causaId: body.causaId || existing?.causaId || null,
          userId: body.userId || user.id,
        },
      });
    } else {
      await prisma.agentChat.create({
        data: {
          title: prompt.slice(0, 80) || "Consulta Hermes",
          messagesJson: JSON.stringify(nextMessages),
          demoMode: result.source === "demo",
          causaId: body.causaId || null,
          userId: body.userId || user.id,
        },
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    return handleRouteError(e);
  }
}
