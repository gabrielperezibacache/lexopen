import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import {
  askHermes,
  getHermesConfig,
  legalSystemPrompt,
  type HermesMessage,
} from "@/lib/integrations/hermes";
import {
  getLlmConfig,
  publicLlmConfig,
  LLM_PRESET_CATALOG,
} from "@/lib/integrations/llm";
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
import { rateLimitAsync } from "@/lib/auth/rate-limit";

const MAX_HERMES_PROMPT = 8000;

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const causaId = req.nextUrl.searchParams.get("causaId");
    if (req.nextUrl.searchParams.get("utilities") === "1") {
      return NextResponse.json({ utilities: AI_UTILITIES });
    }
    if (req.nextUrl.searchParams.get("chats") === "1" || causaId) {
      const chatId = req.nextUrl.searchParams.get("chatId");
      if (chatId) {
        const chat = await prisma.agentChat.findFirst({
          where: {
            id: chatId,
            ...(causaId ? { causaId } : {}),
            ...(user.role === "admin" ? {} : { userId: user.id }),
          },
        });
        if (!chat) {
          return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
        }
        return NextResponse.json(chat);
      }
      const chats = await prisma.agentChat.findMany({
        where: {
          ...(causaId ? { causaId } : {}),
          ...(user.role === "admin" ? {} : { userId: user.id }),
        },
        select: {
          id: true,
          title: true,
          demoMode: true,
          updatedAt: true,
          createdAt: true,
          causaId: true,
          clienteId: true,
          userId: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
      return NextResponse.json(chats);
    }

    const [row, llmRow] = await Promise.all([
      prisma.integrationConfig.findUnique({ where: { provider: "hermes" } }),
      prisma.integrationConfig.findUnique({ where: { provider: "llm" } }),
    ]);
    const config = await getLlmConfig();
    return NextResponse.json({
      enabled: llmRow?.enabled ?? row?.enabled ?? true,
      config: publicLlmConfig(config),
      presets: LLM_PRESET_CATALOG,
      utilities: AI_UTILITIES,
      // Compat: legacy HermesConfig shape
      hermes: await getHermesConfig().then((c) => ({
        ...c,
        apiKey: c.apiKey ? "••••" : "",
      })),
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
      return NextResponse.json(
        {
          error:
            "La configuración del endpoint de IA se edita en Configuración → IA.",
          code: "llm_config_deprecated",
          href: "/configuracion#llm-settings",
        },
        { status: 410 }
      );
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
        Array<
          Record<string, unknown> & {
            role?: string;
            approvedMinutaId?: string;
          }
        >
      >(existing.messagesJson, []);
      let marked = false;
      for (let i = prev.length - 1; i >= 0; i -= 1) {
        if (prev[i]?.role === "assistant") {
          if (prev[i]?.approvedMinutaId) {
            return NextResponse.json(
              {
                error: "Este borrador ya fue aprobado; no se puede descartar",
                code: "already_approved",
              },
              { status: 400 }
            );
          }
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
      if (lastAssistant.source === "demo" && !body.allowDemoApproval) {
        return NextResponse.json(
          {
            error:
              "Este borrador es modo demo. Márquelo explícitamente para guardar como minuta de prueba, o conecte Hermes.",
            code: "demo_approval_required",
          },
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

      const isDemo = lastAssistant.source === "demo";
      const fecha = new Date();
      const titulo = (
        isDemo
          ? `[DEMO] Borrador copiloto — ${utilityLabel}`
          : `Borrador copiloto — ${utilityLabel}`
      ).slice(0, 160);
      const hechos = isDemo
        ? "BORRADOR DEMO (Hermes no conectado). Generado por el copiloto LexOpen en modo local y aprobado explícitamente como prueba. No usar como acta definitiva."
        : "Borrador generado por el copiloto LexOpen y aprobado por un humano. Revisar antes de usar como acta definitiva.";
      const riesgos = isDemo
        ? "Procedencia: copiloto IA en MODO DEMO. No proviene de Hermes real."
        : "Procedencia: copiloto IA. Requiere revisión humana antes de presentación o comunicación al cliente.";
      const markdown = renderMinutaMarkdown({
        tipo: "reunion",
        titulo,
        fecha,
        modalidad: "presencial",
        resumenEjecutivo: content.slice(0, 50_000),
        hechosRelevantes: hechos,
        riesgosAlertas: riesgos,
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
            riesgosAlertas: riesgos,
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

    const promptRaw = String(body.prompt || "").trim();
    if (promptRaw.length > MAX_HERMES_PROMPT) {
      return NextResponse.json(
        {
          error: `El mensaje es demasiado largo (máximo ${MAX_HERMES_PROMPT} caracteres).`,
          code: "prompt_too_long",
        },
        { status: 400 }
      );
    }
    const prompt =
      promptRaw || "Resume el estado procesal y sugiere próximos pasos.";

    const limited = await rateLimitAsync(`llm:hermes:${user.id}`, 30, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        {
          error: "Demasiadas solicitudes al copiloto. Espere un momento e intente de nuevo.",
          code: "rate_limited",
        },
        { status: 429 }
      );
    }

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
      documentoId: body.documentoId || null,
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
      // Env fail-closed: firm flag alone must not reopen demo in production.
      const allowDemo =
        process.env.HERMES_ALLOW_DEMO === "1" ||
        process.env.LLM_ALLOW_DEMO === "1" ||
        (process.env.NODE_ENV === "development" &&
          process.env.HERMES_ALLOW_DEMO !== "0" &&
          process.env.LLM_ALLOW_DEMO !== "0" &&
          firm?.hermesAllowDemo === true);
      if (!allowDemo) {
        return NextResponse.json(
          {
            source: "error",
            content:
              "La integración de IA está deshabilitada en Configuración. Actívela o permita respuestas de demostración en el Host (LLM_ALLOW_DEMO=1).",
            chat: null,
            utility: { id: utility.id, label: utility.label },
            sources: pack.sources,
            alerts: pack.alerts,
            suggestedActions: buildAiSuggestedActions({
              utility: utility.id,
              causaId: body.causaId,
            }),
            requireApproval: false,
            note: "La integración de IA está deshabilitada.",
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
          "> Integración de IA deshabilitada en Configuración → IA.",
          "> **Aprobación humana requerida.**",
        ].join("\n"),
        requireApproval: true,
        note: "⚠ Integración de IA deshabilitada — respuesta de demostración local.",
      };
    } else {
      result = await askHermes({
        causaId: body.causaId,
        userId: chatUserId,
        utilityLabel: utility.label,
        messages,
      });
    }

    const documentScope = {
      documentoIds,
      rutaPrefix,
      sourcesDocumentos: pack.sources.filter((s) => s.type === "documento").length,
    };

    // Prefacio local con alertas / briefing cuando aplica
    if (utility.id === "briefing") {
      const local = buildLocalBriefingMarkdown({
        causaLabel: pack.sources.find((s) => s.type === "causa")?.label || "—",
        alerts: pack.alerts,
        sourcesCount: pack.sources.length,
        folderIndex: pack.folderIndex,
        documentScope: {
          rutaPrefix,
          selectedCount: documentoIds?.length || null,
        },
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
          content:
            result.content ||
            result.note ||
            "El copiloto no devolvió contenido.",
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
        documentScope,
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
      documentScope,
      folderIndex: pack.folderIndex,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
