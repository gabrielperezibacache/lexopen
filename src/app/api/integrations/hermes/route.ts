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
import { buildAiSuggestedActions } from "@/lib/ai/suggested-actions";
import { safeJsonParse } from "@/lib/safe-json";
import {
  formatLocalDate,
  renderMinutaMarkdown,
} from "@/lib/minutas";
import { writeAudit } from "@/lib/audit";

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

    if (body.action === "discard-draft") {
      const chatId = String(body.chatId || "").trim();
      if (!chatId) {
        return NextResponse.json(
          { error: "Se requiere chatId para descartar el borrador" },
          { status: 400 }
        );
      }
      const existing = await prisma.agentChat.findFirst({
        where: {
          id: chatId,
          ...(user.role === "admin" ? {} : { userId: user.id }),
        },
      });
      if (!existing) {
        return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
      }
      const prev = safeJsonParse<
        Array<Record<string, unknown> & { role?: string }>
      >(existing.messagesJson, []);
      let marked = false;
      for (let i = prev.length - 1; i >= 0; i -= 1) {
        if (prev[i]?.role === "assistant") {
          prev[i] = {
            ...prev[i],
            requireApproval: false,
            discarded: true,
          };
          marked = true;
          break;
        }
      }
      if (!marked) {
        return NextResponse.json(
          { error: "No hay borrador de asistente para descartar" },
          { status: 400 }
        );
      }
      const chat = await prisma.agentChat.update({
        where: { id: chatId },
        data: { messagesJson: JSON.stringify(prev) },
      });
      return NextResponse.json({ ok: true, chat });
    }

    if (body.action === "approve-to-minuta") {
      const causaId = String(body.causaId || "").trim();
      const chatId = String(body.chatId || "").trim();
      if (!causaId) {
        return NextResponse.json(
          { error: "Se requiere causaId para guardar el borrador como minuta" },
          { status: 400 }
        );
      }
      if (!chatId) {
        return NextResponse.json(
          {
            error:
              "Se requiere chatId: solo se aprueban borradores persistidos del copiloto",
          },
          { status: 400 }
        );
      }

      let content = "";
      let utilityLabel = String(body.utilityLabel || "Copiloto");
      const existing = await prisma.agentChat.findFirst({
        where: {
          id: chatId,
          ...(user.role === "admin" ? {} : { userId: user.id }),
        },
      });
      if (!existing) {
        return NextResponse.json(
          { error: "Chat no encontrado" },
          { status: 404 }
        );
      }
      if (existing.causaId && existing.causaId !== causaId) {
        return NextResponse.json(
          {
            error:
              "La causa seleccionada no coincide con la del chat del copiloto",
          },
          { status: 400 }
        );
      }
      const chatToUpdate = existing;
      const prev = safeJsonParse<
        Array<{
          role?: string;
          content?: string;
          utility?: string;
          source?: string;
          discarded?: boolean;
          requireApproval?: boolean;
          approvedMinutaId?: string;
        }>
      >(existing.messagesJson, []);
      const lastAssistant = [...prev]
        .reverse()
        .find((m) => m.role === "assistant" && m.content?.trim());
      if (!lastAssistant) {
        return NextResponse.json(
          { error: "No hay borrador de asistente para aprobar" },
          { status: 400 }
        );
      }
      if (lastAssistant.source === "error") {
        return NextResponse.json(
          { error: "No se puede aprobar una respuesta de error" },
          { status: 400 }
        );
      }
      if (lastAssistant.discarded) {
        return NextResponse.json(
          { error: "Este borrador ya fue descartado" },
          { status: 400 }
        );
      }
      if (lastAssistant.approvedMinutaId) {
        return NextResponse.json(
          {
            error: "Este borrador ya fue aprobado",
            minutaId: lastAssistant.approvedMinutaId,
            href: `/causas/${causaId}/minutas/${lastAssistant.approvedMinutaId}`,
          },
          { status: 409 }
        );
      }
      if (lastAssistant.requireApproval === false) {
        return NextResponse.json(
          { error: "Este borrador no está pendiente de aprobación" },
          { status: 400 }
        );
      }
      // Solo contenido persistido del chat
      content = String(lastAssistant.content || "").trim();
      if (lastAssistant.utility) {
        utilityLabel = getAiUtility(lastAssistant.utility).label;
      }

      if (!content) {
        return NextResponse.json(
          { error: "No hay contenido aprobado para guardar" },
          { status: 400 }
        );
      }

      const causa = await prisma.causa.findUnique({
        where: { id: causaId },
        select: {
          id: true,
          titulo: true,
          rit: true,
          tribunal: true,
          materia: true,
        },
      });
      if (!causa) {
        return NextResponse.json(
          { error: "Causa no encontrada" },
          { status: 404 }
        );
      }

      const fecha = new Date();
      const titulo = `Borrador copiloto — ${utilityLabel}`.slice(0, 160);
      const hechos =
        "Borrador generado por el copiloto LexOpen y aprobado por un humano. Revisar antes de usar como acta definitiva.";
      const markdown = renderMinutaMarkdown({
        tipo: "reunion",
        titulo,
        fecha,
        modalidad: "presencial",
        resumenEjecutivo: content.slice(0, 50_000),
        hechosRelevantes: hechos,
        riesgosAlertas:
          "Procedencia: copiloto IA. Requiere revisión humana antes de presentación o comunicación al cliente.",
        causa,
        autorName: user.name,
        acciones: [],
      });
      const docNombre = `Minuta reunion — ${titulo} — ${formatLocalDate(fecha)}.md`;

      const minuta = await prisma.$transaction(async (tx) => {
        const documento = await tx.documento.create({
          data: {
            nombre: docNombre,
            tipo: "minuta",
            mimeType: "text/markdown",
            contenido: markdown,
            causaId: causa.id,
            autorId: user.id,
          },
        });
        return tx.minuta.create({
          data: {
            tipo: "reunion",
            titulo,
            fecha,
            modalidad: "presencial",
            participantes: "",
            resumenEjecutivo: content.slice(0, 50_000),
            hechosRelevantes: hechos,
            riesgosAlertas:
              "Procedencia: copiloto IA. Requiere revisión humana antes de presentación o comunicación al cliente.",
            causaId: causa.id,
            autorId: user.id,
            documentoId: documento.id,
          },
        });
      });

      let chat = null;
      if (chatToUpdate) {
        const prev = safeJsonParse<
          Array<Record<string, unknown> & { role?: string }>
        >(chatToUpdate.messagesJson, []);
        for (let i = prev.length - 1; i >= 0; i -= 1) {
          if (prev[i]?.role === "assistant") {
            prev[i] = {
              ...prev[i],
              requireApproval: false,
              approvedMinutaId: minuta.id,
            };
            break;
          }
        }
        chat = await prisma.agentChat.update({
          where: { id: chatToUpdate.id },
          data: {
            messagesJson: JSON.stringify(prev),
            causaId: causaId,
          },
        });
      }

      await writeAudit({
        action: "minuta.create",
        entityType: "minuta",
        entityId: minuta.id,
        actorId: user.id,
        after: { from: "copiloto", utility: utilityLabel, causaId },
      }).catch(() => undefined);

      const href = `/causas/${causa.id}/minutas/${minuta.id}`;
      return NextResponse.json({
        ok: true,
        minutaId: minuta.id,
        href,
        chat,
      });
    }

    const prompt =
      String(body.prompt || "").trim() ||
      "Resume el estado procesal y sugiere próximos pasos.";
    const utility = getAiUtility(
      body.utility || inferAiUtility(prompt)
    );

    const pack = await buildAiContextPack({
      causaId: body.causaId || null,
      utility: utility.id,
      prompt,
      role: user.role,
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
          Array<{
            role: string;
            content: string;
            discarded?: boolean;
            source?: string;
          }>
        >(existing.messagesJson, []);
        for (const m of prev.slice(-16)) {
          if (
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim() &&
            !m.discarded &&
            m.source !== "error"
          ) {
            history.push({
              role: m.role,
              content: m.content.slice(0, 12_000),
            });
          }
        }
        // Mantener como máximo 12 mensajes útiles
        if (history.length > 12) {
          history.splice(0, history.length - 12);
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

    // Si el chat pertenece a otra causa, forzar hilo nuevo
    if (body.chatId && body.causaId) {
      const bound = await prisma.agentChat.findFirst({
        where: {
          id: String(body.chatId),
          ...(user.role === "admin" ? {} : { userId: user.id }),
        },
        select: { causaId: true },
      });
      if (bound?.causaId && bound.causaId !== body.causaId) {
        return NextResponse.json(
          {
            error:
              "Este chat pertenece a otra causa. Inicie una conversación nueva.",
            code: "causa_mismatch",
          },
          { status: 409 }
        );
      }
    }

    // Respetar toggle: disabled → error o demo local (sin llamar a la red)
    const hermesRow = await prisma.integrationConfig.findUnique({
      where: { provider: "hermes" },
    });
    let result: Awaited<ReturnType<typeof askHermes>>;
    if (hermesRow && hermesRow.enabled === false) {
      const firm = await prisma.firmSettings.findFirst({
        select: { hermesAllowDemo: true },
      });
      const allowDemo =
        process.env.HERMES_ALLOW_DEMO === "1" ||
        process.env.NODE_ENV === "development" ||
        firm?.hermesAllowDemo === true;
      if (!allowDemo) {
        return NextResponse.json(
          {
            source: "error",
            content: "",
            chat: null,
            utility: { id: utility.id, label: utility.label },
            sources: pack.sources,
            alerts: pack.alerts,
            suggestedActions: buildAiSuggestedActions({
              utility: utility.id,
              causaId: body.causaId,
            }),
            requireApproval: false,
            note: "La integración Hermes está deshabilitada en Integraciones.",
            error: "hermes_disabled",
          },
          { status: 503 }
        );
      }
      result = {
        source: "demo",
        content: [
          "## Copiloto LexOpen (demo local)",
          "",
          `**Modo:** ${utility.label}`,
          `**Consulta:** ${prompt.slice(0, 500)}`,
          "",
          "> Integración Hermes deshabilitada en Configuración → Integraciones.",
          "> **Aprobación humana requerida.**",
        ].join("\n"),
        requireApproval: true,
        note: "⚠ Integración Hermes deshabilitada — respuesta demo local.",
      };
    } else {
      result = await askHermes({
        causaId: body.causaId,
        userId: chatUserId,
        utilityLabel: utility.label,
        messages,
      });
    }

    // Prefacio local con alertas / briefing cuando aplica
    if (utility.id === "briefing") {
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

    const suggestedActions = buildAiSuggestedActions({
      utility: utility.id,
      causaId: body.causaId,
    });

    // No persistir turns vacíos o de error (evita contaminar el hilo)
    if (result.source === "error" || !String(result.content || "").trim()) {
      return NextResponse.json(
        {
          ...result,
          content: result.content || "El copiloto no devolvió contenido.",
          chat: null,
          utility: { id: utility.id, label: utility.label },
          sources: pack.sources,
          alerts: pack.alerts,
          suggestedActions,
          requireApproval: false,
        },
        { status: result.source === "error" ? 502 : 200 }
      );
    }

    const nextMessages = [
      { role: "user", content: prompt, utility: utility.id },
      {
        role: "assistant",
        content: result.content,
        source: result.source,
        utility: utility.id,
        sources: pack.sources,
        suggestedActions,
        alerts: pack.alerts,
        requireApproval: Boolean(result.requireApproval),
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
      suggestedActions,
      requireApproval: Boolean(result.requireApproval),
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
