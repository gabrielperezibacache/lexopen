import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  httpError,
  parseBody,
  requireBillingManager,
  requireStaff,
} from "@/lib/api";
import { paymentCreateSchema } from "@/lib/schemas";
import { invoiceStatusAfterPayment } from "@/lib/billing";

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
    assertCsrf(req);
    await requireBillingManager();
    const body = await parseBody(req, paymentCreateSchema);
    const amountClp = body.amountClp;

    const payment = await prisma.$transaction(async (tx) => {
      const invoice = body.invoiceId
        ? await tx.invoice.findUnique({
            where: { id: body.invoiceId },
            select: {
              id: true,
              clienteId: true,
              causaId: true,
              status: true,
              totalClp: true,
              paidClp: true,
            },
          })
        : null;
      if (body.invoiceId && !invoice) {
        throw httpError("Factura no encontrada", 404);
      }
      if (invoice && invoice.clienteId !== body.clienteId) {
        throw httpError("El pago no pertenece al cliente de la factura", 400);
      }
      if (invoice?.status === "anulada") {
        throw httpError("No se puede pagar una factura anulada", 409);
      }
      if (
        invoice &&
        !["emitida", "parcialmente_pagada", "vencida"].includes(invoice.status)
      ) {
        throw httpError("La factura aún no está emitida para recibir pagos", 409);
      }
      if (invoice && amountClp > invoice.totalClp - invoice.paidClp) {
        throw httpError("El pago supera el saldo pendiente de la factura", 409);
      }
      const clienteId = invoice?.clienteId || body.clienteId;
      const cliente = await tx.cliente.findUnique({
        where: { id: clienteId },
        select: { id: true },
      });
      if (!cliente) throw httpError("Cliente no encontrado", 404);

      const created = await tx.payment.create({
        data: {
          date: body.date ? new Date(body.date) : new Date(),
          amountClp,
          method: body.method || "transferencia",
          reference: body.reference || null,
          notes: body.notes || null,
          clienteId,
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
          const status = invoiceStatusAfterPayment(inv.totalClp, paidClp);
          await tx.invoice.update({
            where: { id: inv.id },
            data: { paidClp, status },
          });
        }
      }

      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(payment, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
