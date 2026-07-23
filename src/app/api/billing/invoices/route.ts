import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { computeInvoiceTotals, nextInvoiceNumber } from "@/lib/billing";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const invoices = await prisma.invoice.findMany({
    where: status ? { status } : undefined,
    include: {
      cliente: true,
      causa: true,
      author: true,
      lines: true,
      payments: true,
      _count: { select: { timeEntries: true, expenses: true } },
    },
    orderBy: { issueDate: "desc" },
  });
  return NextResponse.json(invoices);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json();
  const tipoDocumento = body.tipoDocumento || "boleta_honorarios";

  // Build lines from explicit lines and/or selected time+expenses
  const lines: Array<{
    description: string;
    quantity: number;
    unitAmountClp: number;
    amountClp: number;
    tipo: string;
  }> = [];

  const timeIds: string[] = body.timeEntryIds || [];
  const expenseIds: string[] = body.expenseIds || [];

  if (timeIds.length) {
    const times = await prisma.timeEntry.findMany({ where: { id: { in: timeIds } } });
    for (const t of times) {
      lines.push({
        description: `${t.hours}h — ${t.description}`,
        quantity: t.hours,
        unitAmountClp: t.rateClp || 0,
        amountClp: t.amountClp,
        tipo: "honorario",
      });
    }
  }
  if (expenseIds.length) {
    const expenses = await prisma.expense.findMany({ where: { id: { in: expenseIds } } });
    for (const e of expenses) {
      lines.push({
        description: `[${e.category}] ${e.description}`,
        quantity: 1,
        unitAmountClp: e.amountClp,
        amountClp: e.amountClp,
        tipo: "gasto",
      });
    }
  }
  if (body.lines?.length) {
    for (const l of body.lines) {
      const amount = Math.round(Number(l.quantity || 1) * Number(l.unitAmountClp));
      lines.push({
        description: l.description,
        quantity: Number(l.quantity || 1),
        unitAmountClp: Number(l.unitAmountClp),
        amountClp: amount,
        tipo: l.tipo || "honorario",
      });
    }
  }

  if (!lines.length) {
    return NextResponse.json({ error: "La factura necesita al menos una línea" }, { status: 400 });
  }

  const totals = computeInvoiceTotals({ tipoDocumento, lines });
  const count = await prisma.invoice.count();
  const number = body.number || nextInvoiceNumber(count + 1, tipoDocumento);

  const invoice = await prisma.invoice.create({
    data: {
      number,
      tipoDocumento,
      status: body.status || "borrador",
      issueDate: body.issueDate ? new Date(body.issueDate) : new Date(),
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      ...totals,
      notes: body.notes || null,
      glosa: body.glosa || null,
      clienteId: body.clienteId,
      causaId: body.causaId || null,
      authorId: user?.id,
      lines: { create: lines },
    },
    include: { lines: true, cliente: true, causa: true },
  });

  if (timeIds.length) {
    await prisma.timeEntry.updateMany({
      where: { id: { in: timeIds } },
      data: { billed: true, invoiceId: invoice.id },
    });
  }
  if (expenseIds.length) {
    await prisma.expense.updateMany({
      where: { id: { in: expenseIds } },
      data: { billed: true, invoiceId: invoice.id },
    });
  }

  if (invoice.status === "emitida") {
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
        date: invoice.issueDate,
      },
    });
  }

  return NextResponse.json(invoice, { status: 201 });
}
