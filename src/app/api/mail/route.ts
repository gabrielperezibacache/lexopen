import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";
import { listCausasForMail } from "@/lib/mail/ingest";
import { publicMailboxAccount, publicMailboxMessage } from "@/lib/mail/types";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const status = req.nextUrl.searchParams.get("status");
    const messages = await prisma.mailboxMessage.findMany({
      where: {
        userId: user.id,
        ...(status ? { status } : {}),
      },
      include: {
        causa: { select: { id: true, titulo: true, rit: true } },
        attachments: {
          select: {
            filename: true,
            mimeType: true,
            sizeBytes: true,
            documentoId: true,
          },
        },
      },
      orderBy: { receivedAt: "desc" },
      take: 80,
    });
    const tablas = await listCausasForMail(user);
    const account = await prisma.mailboxAccount.findUnique({
      where: { userId: user.id },
    });
    const pending = await prisma.mailboxMessage.count({
      where: {
        userId: user.id,
        status: { in: ["nuevo", "vinculado"] },
      },
    });
    return NextResponse.json({
      messages: messages.map(publicMailboxMessage),
      tablas: tablas.filter((c) => c.proximaTabla),
      causas: tablas,
      account: publicMailboxAccount(account),
      pending,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
