import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { ledgerCreateSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    await requireStaff();
    const clienteId = req.nextUrl.searchParams.get("clienteId");
    const entries = await prisma.ledgerEntry.findMany({
      where: clienteId ? { clienteId } : undefined,
      include: { cliente: true, causa: true, invoice: true, payment: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    // Saldos por cliente
    const all = await prisma.ledgerEntry.findMany({
      orderBy: [{ clienteId: "asc" }, { date: "asc" }, { createdAt: "asc" }],
      include: { cliente: true },
    });
    const balances = new Map<string, { clienteId: string; nombre: string; balanceClp: number }>();
    for (const e of all) {
      balances.set(e.clienteId, {
        clienteId: e.clienteId,
        nombre: e.cliente.razonSocial,
        balanceClp: e.balanceClp,
      });
    }

    return NextResponse.json({
      entries,
      balances: [...balances.values()],
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireStaff();
    const body = await parseBody(req, ledgerCreateSchema);
    const debitClp = body.debitClp || 0;
    const creditClp = body.creditClp || 0;

    const entry = await prisma.$transaction(async (tx) => {
      const last = await tx.ledgerEntry.findFirst({
        where: { clienteId: body.clienteId },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      });
      const prev = last?.balanceClp ?? 0;
      const balanceClp = prev - debitClp + creditClp;

      return tx.ledgerEntry.create({
        data: {
          date: body.date ? new Date(body.date) : new Date(),
          tipo: body.tipo || "provision",
          description: body.description,
          debitClp,
          creditClp,
          balanceClp,
          clienteId: body.clienteId,
          causaId: body.causaId || null,
          invoiceId: body.invoiceId || null,
          paymentId: body.paymentId || null,
        },
        include: { cliente: true, causa: true },
      });
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
