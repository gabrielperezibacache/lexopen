import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  httpError,
  parseBody,
  requireBillingManager,
} from "@/lib/api";
import { ledgerCreateSchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  try {
    await requireBillingManager();
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
    assertCsrf(req);
    await requireBillingManager();
    const body = await parseBody(req, ledgerCreateSchema);
    const debitClp = body.debitClp || 0;
    const creditClp = body.creditClp || 0;

    const entry = await prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findUnique({
        where: { id: body.clienteId },
        select: { id: true },
      });
      if (!cliente) throw httpError("Cliente no encontrado", 404);
      if (debitClp > 0 && creditClp > 0) {
        throw httpError("Un movimiento no puede tener débito y crédito simultáneamente", 400);
      }

      if (body.causaId) {
        const causa = await tx.causa.findUnique({
          where: { id: body.causaId },
          select: { clienteId: true },
        });
        if (!causa) throw httpError("Causa no encontrada", 404);
        if (causa.clienteId && causa.clienteId !== body.clienteId) {
          throw httpError("La causa no pertenece al cliente", 400);
        }
      }
      if (body.invoiceId) {
        const invoice = await tx.invoice.findUnique({
          where: { id: body.invoiceId },
          select: { clienteId: true, causaId: true },
        });
        if (!invoice) throw httpError("Factura no encontrada", 404);
        if (invoice.clienteId !== body.clienteId) {
          throw httpError("La factura no pertenece al cliente", 400);
        }
        if (body.causaId && invoice.causaId && invoice.causaId !== body.causaId) {
          throw httpError("La factura no pertenece a la causa", 400);
        }
      }
      if (body.paymentId) {
        const payment = await tx.payment.findUnique({
          where: { id: body.paymentId },
          select: { clienteId: true, invoiceId: true },
        });
        if (!payment) throw httpError("Pago no encontrado", 404);
        if (payment.clienteId !== body.clienteId) {
          throw httpError("El pago no pertenece al cliente", 400);
        }
        if (body.invoiceId && payment.invoiceId && payment.invoiceId !== body.invoiceId) {
          throw httpError("El pago no pertenece a la factura", 400);
        }
      }

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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(entry, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
