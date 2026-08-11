import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
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
    assertCsrf(req);
    const user = await requireStaff();
    const body = await req.json();

    if (body.action === "save-config") {
      if (user.role !== "admin") {
        return NextResponse.json(
          { error: "Solo admin puede configurar Hermes" },
          { status: 403 }
        );
      }
      const apiUrl = body.config?.apiUrl;
      if (
        apiUrl !== undefined &&
        (!isSafeHttpUrl(apiUrl) || apiUrl.length > 500)
      ) {
        return NextResponse.json({ error: "URL de Hermes inválida" }, { status: 400 });
      }
      await prisma.integrationConfig.upsert({
        where: { provider: "hermes" },
        create: {
          provider: "hermes",
          enabled: Boolean(body.enabled ?? true),
          configJson: JSON.stringify({
            ...(body.config || {}),
            ...(apiUrl ? { apiUrl: String(apiUrl).replace(/\/+$/, "") } : {}),
          }),
        },
        update: {
          enabled: Boolean(body.enabled ?? true),
          configJson: JSON.stringify({
            ...(body.config || {}),
            ...(apiUrl ? { apiUrl: String(apiUrl).replace(/\/+$/, "") } : {}),
          }),
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

    const chatUserId = user.role === "admin" && body.userId ? body.userId : user.id;
    const result = await askHermes({
      causaId: body.causaId,
      userId: chatUserId,
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
    let chat;
    if (body.chatId) {
      const existing = await prisma.agentChat.findFirst({
        where: {
          id: body.chatId,
          ...(user.role === "admin" ? {} : { userId: user.id }),
        },
      });
      if (!existing) {
        return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
      }
      const previous = existing ? JSON.parse(existing.messagesJson || "[]") : [];
      chat = await prisma.agentChat.update({
        where: { id: body.chatId },
        data: {
          messagesJson: JSON.stringify([...previous, ...nextMessages]),
          demoMode: existing?.demoMode || result.source === "demo",
          causaId: body.causaId || existing?.causaId || null,
          userId: chatUserId,
        },
      });
    } else {
      chat = await prisma.agentChat.create({
        data: {
          title: prompt.slice(0, 80) || "Consulta Hermes",
          messagesJson: JSON.stringify(nextMessages),
          demoMode: result.source === "demo",
          causaId: body.causaId || null,
          userId: chatUserId,
        },
      });
    }

    return NextResponse.json({ ...result, chat });
  } catch (e) {
    return handleRouteError(e);
  }
}

function isSafeHttpUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
