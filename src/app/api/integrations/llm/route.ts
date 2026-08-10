import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  requireStaff,
} from "@/lib/api";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { llmConfigSchema } from "@/lib/schemas";
import {
  askLlm,
  getLlmConfig,
  legalSystemPrompt,
  publicLlmConfig,
  saveLlmConfig,
  testLlmConnection,
  LLM_PRESETS,
  type LlmConfig,
} from "@/lib/integrations/llm";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const causaId = req.nextUrl.searchParams.get("causaId");
    const clienteId = req.nextUrl.searchParams.get("clienteId");
    if (
      req.nextUrl.searchParams.get("chats") === "1" ||
      causaId ||
      clienteId
    ) {
      const chats = await prisma.agentChat.findMany({
        where: {
          ...(causaId ? { causaId } : {}),
          ...(clienteId ? { clienteId } : {}),
          ...(user.role === "admin" ? {} : { userId: user.id }),
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
      return NextResponse.json(chats);
    }

    const row = await prisma.integrationConfig.findUnique({
      where: { provider: "llm" },
    });
    const hermesRow = await prisma.integrationConfig.findUnique({
      where: { provider: "hermes" },
    });
    const config = await getLlmConfig();
    return NextResponse.json({
      enabled: row?.enabled ?? hermesRow?.enabled ?? false,
      config: publicLlmConfig(config),
      presets: {
        ...LLM_PRESETS,
        azure: {
          label: "Azure OpenAI",
          apiUrl: "https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT",
          model: "gpt-4o-mini",
        },
        custom: {
          label: "Personalizado (OpenAI-compatible)",
          apiUrl: "",
          model: "",
        },
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await req.json();

    if (body.action === "save-config") {
      const parsed = llmConfigSchema.parse(body.config || {});
      const config: Partial<LlmConfig> = {
        ...parsed,
        apiKey:
          parsed.apiKey === null || parsed.apiKey === undefined
            ? undefined
            : parsed.apiKey,
      };
      const saved = await saveLlmConfig({
        enabled: Boolean(body.enabled ?? true),
        config,
      });
      return NextResponse.json({
        ok: true,
        config: publicLlmConfig(saved),
      });
    }

    if (body.action === "test") {
      const result = await testLlmConnection();
      return NextResponse.json(result);
    }

    const promptSchema = z.object({
      prompt: z.string().optional(),
      causaId: z.string().optional().nullable(),
      clienteId: z.string().optional().nullable(),
      chatId: z.string().optional().nullable(),
      userId: z.string().optional().nullable(),
    });
    const parsed = promptSchema.parse(body);

    let context = "";
    if (parsed.causaId) {
      const causa = await prisma.causa.findUnique({
        where: { id: parsed.causaId },
        include: {
          partes: true,
          plazos: true,
          tramites: { orderBy: { orden: "asc" }, take: 30 },
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
            partes: causa.partes,
            tramites: causa.tramites.map((t) => ({
              titulo: t.titulo,
              estado: t.estado,
              fechaLimite: t.fechaLimite,
            })),
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
            })),
          },
          null,
          2
        );
      }
    }

    const prompt =
      parsed.prompt ||
      "Resume el estado procesal y sugiere próximos pasos.";
    const result = await askLlm({
      causaId: parsed.causaId || undefined,
      clienteId: parsed.clienteId || undefined,
      userId: parsed.userId || user.id,
      messages: [
        { role: "system", content: legalSystemPrompt(context) },
        { role: "user", content: prompt },
      ],
    });

    const nextMessages = [
      { role: "user", content: prompt },
      { role: "assistant", content: result.content, source: result.source },
    ];

    let chat;
    if (parsed.chatId) {
      const existing = await prisma.agentChat.findFirst({
        where: {
          id: parsed.chatId,
          ...(user.role === "admin" ? {} : { userId: user.id }),
        },
      });
      if (!existing) {
        return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
      }
      const previous = JSON.parse(existing.messagesJson || "[]");
      chat = await prisma.agentChat.update({
        where: { id: parsed.chatId },
        data: {
          messagesJson: JSON.stringify([...previous, ...nextMessages]),
          demoMode: existing.demoMode || result.source === "demo",
          causaId: parsed.causaId || existing.causaId || null,
          clienteId: parsed.clienteId || existing.clienteId || null,
          userId: parsed.userId || user.id,
        },
      });
    } else {
      chat = await prisma.agentChat.create({
        data: {
          title: prompt.slice(0, 80) || "Consulta IA",
          messagesJson: JSON.stringify(nextMessages),
          demoMode: result.source === "demo",
          causaId: parsed.causaId || null,
          clienteId: parsed.clienteId || null,
          userId: parsed.userId || user.id,
        },
      });
    }

    return NextResponse.json({ ...result, chat });
  } catch (e) {
    return handleRouteError(e);
  }
}
