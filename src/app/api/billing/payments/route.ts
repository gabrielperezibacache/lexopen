import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const payments = await prisma.payment.findMany({
    include: { cliente: true, invoice: true },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(payments);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const amountClp = Number(body.amountClp);

  const payment = await prisma.payment.create({
    data: {
      date: body.date ? new Date(body.date) : new Date(),
      amountClp,
      method: body.method || "transferencia",
      reference: body.reference || null,
      notes: body.notes || null,
      clienteId: body.clienteId,
      invoiceId: body.invoiceId || null,
    },
    include: { cliente: true, invoice: true },
  });

  const last = await prisma.ledgerEntry.findFirst({
    where: { clienteId: payment.clienteId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const prev = last?.balanceClp ?? 0;

  await prisma.ledgerEntry.create({
    data: {
      clienteId: payment.clienteId,
      invoiceId: payment.invoiceId,
      paymentId: payment.id,
      causaId: payment.invoice?.causaId,
      tipo: "pago",
      description: `Pago ${payment.method}${payment.reference ? ` · ${payment.reference}` : ""}`,
      debitClp: 0,
      creditClp: amountClp,
      balanceClp: prev + amountClp,
      date: payment.date,
    },
  });

  if (payment.invoiceId) {
    const inv = await prisma.invoice.findUnique({ where: { id: payment.invoiceId } });
    if (inv) {
      const paidClp = inv.paidClp + amountClp;
      const status =
        paidClp >= inv.totalClp
          ? "pagada"
          : paidClp > 0
            ? "parcialmente_pagada"
            : inv.status;
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { paidClp, status },
      });
    }
  }

  return NextResponse.json(payment, { status: 201 });
}
