import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";
import { listCausasForMail } from "@/lib/mail/ingest";

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
      messages,
      tablas: tablas.filter((c) => c.proximaTabla),
      causas: tablas,
      account,
      pending,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await req.json().catch(() => ({}));
    if (body.action === "discard-all-demo") {
      await prisma.mailboxMessage.deleteMany({
        where: { userId: user.id, externalId: { startsWith: "demo-" } },
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  } catch (e) {
    return handleRouteError(e);
  }
}
