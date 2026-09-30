import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import type { Role } from "@/lib/auth/rbac";
import { runAssistantTurn } from "@/lib/assistant/pipeline";
import { safeJsonParse } from "@/lib/safe-json";

const MAX_TEXT = 8000;

const bodySchema = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT),
  attachments: z.array(z.string().max(20_000)).max(5).optional(),
  chatId: z.string().optional(),
});

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * `POST /api/assistant` — turno del asistente en streaming SSE.
 * Eventos: `status`, `clarify`, `plan`, `done`, `error`.
 */
export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const raw = await req.json().catch(() => ({}));
    const body = bodySchema.parse(raw);

    const limited = await rateLimitAsync(`assistant:${user.id}`, 30, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        {
          error: "Demasiadas solicitudes al asistente. Espere un momento e intente de nuevo.",
          code: "rate_limited",
        },
        { status: 429 }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        };
        try {
          const result = await runAssistantTurn({
            text: body.text,
            attachments: body.attachments,
            user: { id: user.id, role: user.role as Role },
            chatId: body.chatId,
          });

          for (const evt of result.streamEvents) {
            if (evt.type === "status") send("status", { message: evt.message });
            else if (evt.type === "clarify") send("clarify", { message: evt.message });
            else if (evt.type === "plan") send("plan", { plan: evt.plan });
            else if (evt.type === "error") send("error", { message: evt.message });
            // los eventos "result" (lecturas auto-ejecutadas) se envían en "done".
          }

          const assistantMessage =
            result.clarify ||
            result.autoResults?.map((r) => r.result.message).filter(Boolean).join("\n\n") ||
            (result.planId
              ? "Plan preparado. Confirme para ejecutar los cambios."
              : "No pude generar una respuesta con los datos disponibles.");

          const nextMessages = [
            { role: "user", content: body.text },
            {
              role: "assistant",
              content: assistantMessage,
              planId: result.planId,
              results: result.autoResults?.map((r) => ({ toolId: r.toolId, ...r.result })),
            },
          ];

          let chat = null;
          if (body.chatId) {
            const existing = await prisma.agentChat.findFirst({
              where: {
                id: body.chatId,
                ...(user.role === "admin" ? {} : { userId: user.id }),
              },
            });
            if (existing) {
              const prev = safeJsonParse<Array<Record<string, unknown>>>(
                existing.messagesJson,
                []
              );
              chat = await prisma.agentChat.update({
                where: { id: body.chatId },
                data: {
                  messagesJson: JSON.stringify([
                    ...(Array.isArray(prev) ? prev : []),
                    ...nextMessages,
                  ]),
                },
              });
            }
          }
          if (!chat) {
            chat = await prisma.agentChat.create({
              data: {
                title: `[Asistente] ${body.text.slice(0, 60)}` || "Consulta",
                messagesJson: JSON.stringify(nextMessages),
                userId: user.id,
              },
            });
          }

          send("done", {
            planId: result.planId,
            chatId: chat.id,
            needsConfirm: Boolean(result.planId) && result.autoResults === undefined,
            results: result.autoResults || [],
          });
        } catch (e) {
          send("error", {
            message: e instanceof Error ? e.message : "Error interno del asistente.",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
