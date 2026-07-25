import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { paymentCreateSchema } from "@/lib/schemas";

export async function GET() {
  try {
    await requireStaff();
    const payments = await prisma.payment.findMany({
      include: { cliente: true, invoice: true },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(payments);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireStaff();
    const body = await parseBody(req, paymentCreateSchema);
    const amountClp = body.amountClp;

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
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

      const last = await tx.ledgerEntry.findFirst({
        where: { clienteId: created.clienteId },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      });
      const prev = last?.balanceClp ?? 0;

      await tx.ledgerEntry.create({
        data: {
          clienteId: created.clienteId,
          invoiceId: created.invoiceId,
          paymentId: created.id,
          causaId: created.invoice?.causaId,
          tipo: "pago",
          description: `Pago ${created.method}${created.reference ? ` · ${created.reference}` : ""}`,
          debitClp: 0,
          creditClp: amountClp,
          balanceClp: prev + amountClp,
          date: created.date,
        },
      });

      if (created.invoiceId) {
        const inv = await tx.invoice.findUnique({ where: { id: created.invoiceId } });
        if (inv) {
          const paidClp = inv.paidClp + amountClp;
          const status =
            paidClp >= inv.totalClp
              ? "pagada"
              : paidClp > 0
                ? "parcialmente_pagada"
                : inv.status;
          await tx.invoice.update({
            where: { id: inv.id },
            data: { paidClp, status },
          });
        }
      }

      return created;
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
