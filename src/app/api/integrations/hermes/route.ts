import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import {
  askHermes,
  getHermesConfig,
  hermesDemoAllowed,
  legalSystemPrompt,
  sanitizeHermesMessages,
  statusLabel,
  type HermesMessage,
} from "@/lib/integrations/hermes";

const askSchema = z.object({
  action: z.literal("ask").optional(),
  prompt: z.string().min(1).max(8000).optional(),
  causaId: z.string().optional().nullable(),
  chatId: z.string().optional().nullable(),
});

const saveSchema = z.object({
  action: z.literal("save-config"),
  enabled: z.boolean().optional(),
  config: z
    .object({
      apiUrl: z.string().url().optional(),
      model: z.string().min(1).max(120).optional(),
      requireApproval: z.boolean().optional(),
      apiKey: z.string().optional(),
      timeoutMs: z.number().int().positive().max(120000).optional(),
    })
    .optional(),
});

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

    const row = await prisma.integrationConfig.findUnique({
      where: { provider: "hermes" },
    });
    const config = await getHermesConfig();
    const demoAllowed = await hermesDemoAllowed();

    let probe: { ok: boolean; detail: string } = {
      ok: false,
      detail: "no comprobado",
    };
    if (req.nextUrl.searchParams.get("probe") === "1") {
      try {
        const res = await fetch(`${config.apiUrl}/models`, {
          headers: config.apiKey
            ? { Authorization: `Bearer ${config.apiKey}` }
            : {},
          signal: AbortSignal.timeout(4000),
        });
        probe = {
          ok: res.ok,
          detail: res.ok ? "API alcanzable" : `HTTP ${res.status}`,
        };
      } catch (e) {
        probe = {
          ok: false,
          detail: e instanceof Error ? e.message : "unreachable",
        };
      }
    }

    return NextResponse.json({
      enabled: row?.enabled ?? false,
      demoAllowed,
      probe,
      statusHint: demoAllowed
        ? "Si Hermes no responde, LexOpen usará borrador demo etiquetado."
        : "Fail-closed: sin Hermes no hay respuesta demo.",
      config: {
        apiUrl: config.apiUrl,
        model: config.model,
        requireApproval: config.requireApproval,
        timeoutMs: config.timeoutMs,
        apiKey: config.apiKey ? "••••" : "",
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const raw = await req.json().catch(() => ({}));

    if (raw?.action === "save-config") {
      const body = saveSchema.parse(raw);
      const current = await getHermesConfig();
      const next = {
        apiUrl: body.config?.apiUrl || current.apiUrl,
        model: body.config?.model || current.model,
        requireApproval:
          body.config?.requireApproval ?? current.requireApproval,
        timeoutMs: body.config?.timeoutMs || current.timeoutMs,
        // Keep previous key if UI sends masked value
        apiKey:
          body.config?.apiKey && body.config.apiKey !== "••••"
            ? body.config.apiKey
            : current.apiKey,
      };
      await prisma.integrationConfig.upsert({
        where: { provider: "hermes" },
        create: {
          provider: "hermes",
          enabled: Boolean(body.enabled ?? true),
          configJson: JSON.stringify(next),
        },
        update: {
          enabled: Boolean(body.enabled ?? true),
          configJson: JSON.stringify(next),
        },
      });
      await writeAudit({
        actorId: user.id,
        action: "hermes.save-config",
        entityType: "IntegrationConfig",
        entityId: "hermes",
        after: { enabled: body.enabled ?? true, apiUrl: next.apiUrl },
      });
      return NextResponse.json({ ok: true });
    }

    const body = askSchema.parse({ ...raw, action: raw?.action || "ask" });
    const prompt =
      body.prompt?.trim() ||
      "Resume el estado procesal y sugiere próximos pasos.";

    let context = "";
    if (body.causaId) {
      const causa = await prisma.causa.findUnique({
        where: { id: body.causaId },
        include: {
          partes: true,
          plazos: { where: { estado: { in: ["pendiente", "vencido"] } } },
          minutas: {
            where: canSeeConfidential(user.role)
              ? {}
              : { confidencial: false },
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
            partes: causa.partes.map((p) => ({
              rol: p.rol,
              nombre: p.nombre,
              rut: p.rut,
            })),
            plazos: causa.plazos.map((p) => ({
              titulo: p.titulo,
              fecha: p.fechaLimite,
              estado: p.estado,
              esFatal: p.esFatal,
            })),
            minutasRecientes: causa.minutas.map((m) => ({
              tipo: m.tipo,
              titulo: m.titulo,
              fecha: m.fecha,
              confidencial: m.confidencial,
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

    let history: HermesMessage[] = [];
    let existingChat = null as
      | Awaited<ReturnType<typeof prisma.agentChat.findFirst>>
      | null;
    if (body.chatId) {
      existingChat = await prisma.agentChat.findFirst({
        where: {
          id: body.chatId,
          ...(user.role === "admin" ? {} : { userId: user.id }),
        },
      });
      if (!existingChat) {
        return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
      }
      const previous = JSON.parse(existingChat.messagesJson || "[]") as Array<{
        role: string;
        content: string;
      }>;
      history = previous
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: String(m.content || ""),
        }));
    }

    const messages = sanitizeHermesMessages([
      { role: "system", content: legalSystemPrompt(context) },
      ...history,
      { role: "user", content: prompt },
    ]);

    const result = await askHermes({
      causaId: body.causaId || undefined,
      userId: user.id,
      messages,
    });

    // Do not persist empty error replies as if they were answers
    if (result.source === "error" && !result.content) {
      return NextResponse.json({
        ...result,
        statusLabel: statusLabel(result.source),
        chat: existingChat,
      });
    }

    const nextMessages = [
      ...history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user" as const, content: prompt },
      {
        role: "assistant" as const,
        content: result.content,
        source: result.source,
      },
    ];

    let chat;
    if (existingChat) {
      chat = await prisma.agentChat.update({
        where: { id: existingChat.id },
        data: {
          messagesJson: JSON.stringify(nextMessages),
          demoMode: existingChat.demoMode || result.source === "demo",
          causaId: body.causaId || existingChat.causaId || null,
          userId: user.id,
        },
      });
    } else {
      chat = await prisma.agentChat.create({
        data: {
          title: prompt.slice(0, 80) || "Consulta Hermes",
          messagesJson: JSON.stringify(nextMessages),
          demoMode: result.source === "demo",
          causaId: body.causaId || null,
          userId: user.id,
        },
      });
    }

    await writeAudit({
      actorId: user.id,
      action: "hermes.ask",
      entityType: "AgentChat",
      entityId: chat.id,
      after: {
        source: result.source,
        causaId: body.causaId || null,
        demoMode: chat.demoMode,
      },
    });

    return NextResponse.json({
      ...result,
      statusLabel: statusLabel(result.source),
      chat,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
