import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import {
  applyMailboxMessage,
  discardMailboxMessage,
  linkMailboxMessage,
} from "@/lib/mail/apply";
import { prisma } from "@/lib/db";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const actionSchema = z.object({
  action: z.enum(["apply", "link", "discard"]),
  causaId: z.string().optional(),
});

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    const message = await prisma.mailboxMessage.findFirst({
      where: { id, userId: user.id },
      include: {
        causa: { select: { id: true, titulo: true, rit: true } },
      },
    });
    if (!message) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ message });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const body = actionSchema.parse(await req.json());
    if (body.action === "discard") {
      const message = await discardMailboxMessage(user.id, id);
      return NextResponse.json({ message });
    }
    if (body.action === "link") {
      if (!body.causaId) {
        return NextResponse.json({ error: "causaId requerido" }, { status: 400 });
      }
      const message = await linkMailboxMessage(user, id, body.causaId);
      return NextResponse.json({ message });
    }
    const message = await applyMailboxMessage(user, id, body.causaId);
    return NextResponse.json({ message });
  } catch (e) {
    return handleRouteError(e);
  }
}
