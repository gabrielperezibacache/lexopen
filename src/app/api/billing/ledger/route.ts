import {
  assertCsrf,
  handleRouteError,
  httpError,
  parseBody,
  requireBillingManager,
} from "@/lib/api";
import { writeAuditStrict } from "@/lib/audit";
import { assertBillingCausa, causaAccessWhere as scopedcausaAccessWhere, billingRelatedWhere as scopedrelatedCausaWhere } from "@/lib/auth/causa-access";
import { can } from "@/lib/auth/permissions";
import { ledgerAccessWhere, loadScopedLedgerBalances, scopedLedgerRunningBalances } from "@/lib/billing-overview";
import { executeCommand, requestCommandKey } from "@/lib/command-execution";
import { prisma } from "@/lib/db";
import { ledgerCreateSchema } from "@/lib/schemas";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const user = await requireBillingManager();
    const clienteId = req.nextUrl.searchParams.get("clienteId");
    const rawEntries = await prisma.ledgerEntry.findMany({
      where: { AND: [ledgerAccessWhere(user), clienteId ? { clienteId } : {}] },
      include: { cliente: true, causa: true, invoice: true, payment: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    const totals = await loadScopedLedgerBalances(user);
    const clients = await prisma.cliente.findMany({ where: { id: { in: totals.map(t => t.clienteId) } }, select: { id: true, razonSocial: true } });
    const names = new Map(clients.map(c => [c.id, c.razonSocial]));
    const entries = scopedLedgerRunningBalances(rawEntries);
    const balances = totals.map(total => ({ ...total, nombre: names.get(total.clienteId) || "Cliente" }));

    return NextResponse.json({
      entries,
      balances,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireBillingManager();
    const body = await parseBody(req, ledgerCreateSchema);
    const tipo = body.tipo || "provision";
    const debitClp = body.debitClp || 0;
    const creditClp = body.creditClp || 0;

    async function resolveReferences(tx: Prisma.TransactionClient) {
      let causaId = body.causaId || null;
      let invoiceId = body.invoiceId || null;
      const cliente = await tx.cliente.findUnique({
        where: { id: body.clienteId },
        select: { id: true },
      });
      if (!cliente) throw httpError("Cliente no encontrado", 404);
      if (debitClp > 0 && creditClp > 0) {
        throw httpError("Un movimiento no puede tener débito y crédito simultáneamente", 400);
      }

      if (causaId) {
        const causa = await tx.causa.findFirst({
          where: { AND: [scopedcausaAccessWhere(user), { id: causaId }] },
          select: { clienteId: true },
        });
        if (!causa) throw httpError("Causa no encontrada", 404);
        if (causa.clienteId && causa.clienteId !== body.clienteId) {
          throw httpError("La causa no pertenece al cliente", 400);
        }
      }
      if (body.paymentId) {
        const payment = await tx.payment.findUnique({ where: { id: body.paymentId }, select: { clienteId: true, invoiceId: true } });
        if (!payment || payment.clienteId !== body.clienteId) throw httpError("Pago no encontrado", 404);
        if (!payment.invoiceId && !can(user, "billing.manage")) throw httpError("Pago no encontrado", 404);
        if (invoiceId && payment.invoiceId !== invoiceId) throw httpError("El pago no pertenece a la factura", 400);
        invoiceId ||= payment.invoiceId;
      }
      if (invoiceId) {
        const invoice = await tx.invoice.findFirst({
          where: { AND: [scopedrelatedCausaWhere(user), { id: invoiceId }] },
          select: { clienteId: true, causaId: true },
        });
        if (!invoice) throw httpError("Factura no encontrada", 404);
        if (invoice.clienteId !== body.clienteId) {
          throw httpError("La factura no pertenece al cliente", 400);
        }
        if (causaId && invoice.causaId !== causaId) {
          throw httpError("La factura no pertenece a la causa", 400);
        }
        causaId ||= invoice.causaId;
      }
      await assertBillingCausa(user, causaId, tipo === "provision" ? "ledger.provision" : "billing.manage", tx);
      return { causaId, invoiceId };
    }
    const entry = await executeCommand({ key: requestCommandKey(req, "billing.ledger"), ownerId: user.id, input: body, run: async (tx) => {
      const { causaId, invoiceId } = await resolveReferences(tx);
      const totals = await tx.ledgerEntry.aggregate({ where: { clienteId: body.clienteId }, _sum: { debitClp: true, creditClp: true } });
      const prev = (totals._sum.creditClp || 0) - (totals._sum.debitClp || 0);
      const balanceClp = prev - debitClp + creditClp;

      const created = await tx.ledgerEntry.create({
        data: {
          date: body.date ? new Date(body.date) : new Date(),
          tipo,
          description: body.description,
          debitClp,
          creditClp,
          balanceClp,
          clienteId: body.clienteId,
          causaId,
          invoiceId,
          paymentId: body.paymentId || null,
        },
        include: { cliente: true, causa: true },
      });
      await writeAuditStrict({ actorId: user.id, action: "billing.ledger.create", entityType: "LedgerEntry", entityId: created.id, after: { clienteId: body.clienteId, causaId, invoiceId, debitClp, creditClp } }, tx);
      return { id: created.id };
    }, authorize: async (tx) => { await resolveReferences(tx); } });
    const saved = await prisma.ledgerEntry.findFirst({ where: { id: entry.id, ...ledgerAccessWhere(user) }, include: { cliente: true, causa: true } });
    if (!saved) throw httpError("Movimiento no encontrado", 404);
    const visible = await prisma.ledgerEntry.aggregate({ where: { AND: [ledgerAccessWhere(user), { clienteId: body.clienteId }] }, _sum: { debitClp: true, creditClp: true } });
    return NextResponse.json({ ...saved, balanceClp: (visible._sum.creditClp || 0) - (visible._sum.debitClp || 0) }, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
