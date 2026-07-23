import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      cliente: true,
      causa: true,
      author: true,
      lines: true,
      payments: { orderBy: { date: "desc" } },
      timeEntries: { include: { user: true } },
      expenses: true,
    },
  });
  if (!invoice) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json(invoice);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const current = await prisma.invoice.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      status: body.status,
      notes: body.notes,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      paidClp: body.paidClp,
    },
    include: { cliente: true, lines: true, payments: true },
  });

  // Al emitir por primera vez, asentar en cuenta corriente
  if (current.status === "borrador" && body.status === "emitida") {
    const last = await prisma.ledgerEntry.findFirst({
      where: { clienteId: invoice.clienteId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    const prev = last?.balanceClp ?? 0;
    await prisma.ledgerEntry.create({
      data: {
        clienteId: invoice.clienteId,
        causaId: invoice.causaId,
        invoiceId: invoice.id,
        tipo: "cargo_honorario",
        description: `Emisión ${invoice.number}`,
        debitClp: invoice.totalClp,
        creditClp: 0,
        balanceClp: prev - invoice.totalClp,
        date: new Date(),
      },
    });
  }

  return NextResponse.json(invoice);
}
