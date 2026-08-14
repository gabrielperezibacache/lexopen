import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { buildClienteFolderContext } from "@/lib/integrations/client-folder-context";
import { askLlm, legalSystemPrompt } from "@/lib/integrations/llm";
import { safeJsonParse } from "@/lib/safe-json";
import { rateLimitAsync } from "@/lib/auth/rate-limit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    const chats = await prisma.agentChat.findMany({
      where: {
        clienteId: id,
        ...(user.role === "admin" ? {} : { userId: user.id }),
      },
      select: {
        id: true,
        title: true,
        demoMode: true,
        updatedAt: true,
        createdAt: true,
        clienteId: true,
        causaId: true,
        userId: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });
    return NextResponse.json(chats);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const body = await parseBody(
      req,
      z.object({
        prompt: z.string().min(1).max(8000),
        chatId: z.string().optional().nullable(),
      })
    );

    const limited = await rateLimitAsync(`llm:cliente:${user.id}`, 30, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        {
          error:
            "Demasiadas solicitudes al copiloto. Espere un momento e intente de nuevo.",
          code: "rate_limited",
        },
        { status: 429 }
      );
    }

    const built = await buildClienteFolderContext(id, user.role);
    if (!built) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const prompt = body.prompt.trim();
    const result = await askLlm({
      userId: user.id,
      utilityLabel: "Chat carpeta cliente",
      messages: [
        {
          role: "system",
          content: legalSystemPrompt(
            `Trabajas sobre la carpeta del cliente. Usa solo el contexto siguiente (causas, trámites, documentos).\n${built.context}`
          ),
        },
        { role: "user", content: prompt },
      ],
    });

    const nextMessages = [
      { role: "user", content: prompt },
      { role: "assistant", content: result.content, source: result.source },
    ];

    let chat;
    if (body.chatId) {
      const existing = await prisma.agentChat.findFirst({
        where: {
          id: body.chatId,
          clienteId: id,
          ...(user.role === "admin" ? {} : { userId: user.id }),
        },
      });
      if (!existing) {
        return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 });
      }
      const previous = safeJsonParse<
        Array<{ role: string; content: string; source?: string }>
      >(existing.messagesJson || "[]", []);
      chat = await prisma.agentChat.update({
        where: { id: body.chatId },
        data: {
          messagesJson: JSON.stringify([...previous, ...nextMessages]),
          demoMode: existing.demoMode || result.source === "demo",
          userId: user.id,
        },
      });
    } else {
      chat = await prisma.agentChat.create({
        data: {
          title: `${built.cliente.razonSocial}: ${prompt.slice(0, 60)}`,
          messagesJson: JSON.stringify(nextMessages),
          demoMode: result.source === "demo",
          clienteId: id,
          userId: user.id,
        },
      });
    }

    return NextResponse.json({
      ...result,
      chat: chat
        ? {
            id: chat.id,
            title: chat.title,
            demoMode: chat.demoMode,
            updatedAt: chat.updatedAt,
            clienteId: chat.clienteId,
            causaId: chat.causaId,
          }
        : null,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
