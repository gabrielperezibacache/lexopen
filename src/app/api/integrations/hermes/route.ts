import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import {
  askHermes,
  getHermesConfig,
  legalSystemPrompt,
  type HermesMessage,
} from "@/lib/integrations/hermes";
import { isSafeOutboundHttpUrl } from "@/lib/net/safe-url";
import { buildAiContextPack } from "@/lib/ai/context-pack";
import {
  AI_UTILITIES,
  getAiUtility,
  inferAiUtility,
} from "@/lib/ai/utilities";
import {
  buildLocalBriefingMarkdown,
  formatPlazoEstimate,
} from "@/lib/ai/local-assist";
import { safeJsonParse } from "@/lib/safe-json";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const causaId = req.nextUrl.searchParams.get("causaId");
    if (req.nextUrl.searchParams.get("utilities") === "1") {
      return NextResponse.json({ utilities: AI_UTILITIES });
    }
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

    const row = await prisma.integrationConfig.findUnique({
      where: { provider: "hermes" },
    });
    const config = await getHermesConfig();
    return NextResponse.json({
      enabled: row?.enabled ?? false,
      config: { ...config, apiKey: config.apiKey ? "••••" : "" },
      utilities: AI_UTILITIES,
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
        return NextResponse.json(
          { error: "URL de Hermes inválida" },
          { status: 400 }
        );
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

    if (body.action === "estimate-plazo") {
      const estimate = formatPlazoEstimate({
        desde: String(body.desde || ""),
        dias: Number(body.dias || 0),
        tipoComputo: body.tipoComputo === "corridos" ? "corridos" : "habiles",
      });
      return NextResponse.json({ ok: !("error" in estimate), ...estimate });
    }

    const prompt =
      String(body.prompt || "").trim() ||
      "Resume el estado procesal y sugiere próximos pasos.";
    const utility = getAiUtility(
      body.utility || inferAiUtility(prompt)
    );

    const documentoIds = Array.isArray(body.documentoIds)
      ? body.documentoIds.map((id: unknown) => String(id)).filter(Boolean).slice(0, 40)
      : null;
    const rutaPrefix =
      typeof body.rutaPrefix === "string" && body.rutaPrefix.trim()
        ? body.rutaPrefix.trim().slice(0, 500)
        : null;

    const pack = await buildAiContextPack({
      causaId: body.causaId || null,
      utility: utility.id,
      prompt,
      role: user.role,
      documentoIds,
      rutaPrefix,
    });

    // Historial multi-turno (estilo Julia: recuerda la conversación)
    const history: HermesMessage[] = [];
    if (body.chatId) {
      const existing = await prisma.agentChat.findFirst({
        where: {
          id: body.chatId,
          ...(user.role === "admin" ? {} : { userId: user.id }),
        },
      });
      if (existing) {
        const prev = safeJsonParse<
          Array<{ role: string; content: string }>
        >(existing.messagesJson, []);
        for (const m of prev.slice(-12)) {
          if (
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim()
          ) {
            history.push({
              role: m.role,
              content: m.content.slice(0, 12_000),
            });
          }
        }
      }
    }

    const messages: HermesMessage[] = [
      {
        role: "system",
        content: legalSystemPrompt({
          context: pack.text.slice(0, 48_000),
          utilityHint: `${utility.label}: ${utility.systemHint}`,
          alerts: pack.alerts,
        }),
      },
      ...history,
      { role: "user", content: prompt },
    ];

    const chatUserId =
      user.role === "admin" && body.userId ? body.userId : user.id;

    let result = await askHermes({
      causaId: body.causaId,
      userId: chatUserId,
      utilityLabel: utility.label,
      messages,
    });

    // Prefacio local con alertas / briefing cuando aplica
    if (utility.id === "briefing" && pack.alerts.length) {
      const local = buildLocalBriefingMarkdown({
        causaLabel: pack.sources.find((s) => s.type === "causa")?.label || "—",
        alerts: pack.alerts,
        sourcesCount: pack.sources.length,
      });
      if (result.content) {
        result = {
          ...result,
          content: `${local}\n---\n\n${result.content}`,
        };
      }
    } else if (pack.alerts.length && result.content) {
      result = {
        ...result,
        content: `> Alertas LexOpen:\n${pack.alerts
          .map((a) => `> - ${a}`)
          .join("\n")}\n\n${result.content}`,
      };
    }

    const nextMessages = [
      { role: "user", content: prompt, utility: utility.id },
      {
        role: "assistant",
        content: result.content,
        source: result.source,
        utility: utility.id,
      },
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
      const previous = safeJsonParse(existing.messagesJson, []);
      chat = await prisma.agentChat.update({
        where: { id: body.chatId },
        data: {
          messagesJson: JSON.stringify([
            ...(Array.isArray(previous) ? previous : []),
            ...nextMessages,
          ]),
          demoMode: existing.demoMode || result.source === "demo",
          causaId: body.causaId || existing.causaId || null,
          userId: chatUserId,
        },
      });
    } else {
      chat = await prisma.agentChat.create({
        data: {
          title: `[${utility.label}] ${prompt.slice(0, 60)}` || "Consulta",
          messagesJson: JSON.stringify(nextMessages),
          demoMode: result.source === "demo",
          causaId: body.causaId || null,
          userId: chatUserId,
        },
      });
    }

    return NextResponse.json({
      ...result,
      chat,
      utility: { id: utility.id, label: utility.label },
      sources: pack.sources,
      alerts: pack.alerts,
      suggestedActions: [
        body.causaId
          ? { label: "Abrir causa", href: `/causas/${body.causaId}` }
          : null,
        { label: "Documentos", href: "/documentos" },
        { label: "Plazos", href: "/plazos" },
        { label: "Jurisprudencia", href: "/jurisprudencia" },
        { label: "Monitoreo PJUD", href: "/causas/monitoreo" },
      ].filter(Boolean),
      documentScope: {
        documentoIds,
        rutaPrefix,
        sourcesDocumentos: pack.sources.filter((s) => s.type === "documento").length,
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

function isSafeHttpUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 500) return false;
  const allowLocal =
    process.env.NODE_ENV !== "production" ||
    process.env.HERMES_ALLOW_PRIVATE_URL === "1";
  if (isSafeOutboundHttpUrl(value, { allowHttp: allowLocal })) return true;
  try {
    const url = new URL(value);
    return (
      allowLocal &&
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}
