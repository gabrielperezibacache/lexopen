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
import { computeInvoiceTotals, nextInvoiceNumber } from "@/lib/billing";
import { invoiceCreateSchema } from "@/lib/schemas";
import { publicUserSelect } from "@/lib/auth/public-user";

export async function GET(req: NextRequest) {
  try {
    await requireBillingManager();
    const status = req.nextUrl.searchParams.get("status");
    const invoices = await prisma.invoice.findMany({
      where: status ? { status } : undefined,
      include: {
        cliente: true,
        causa: true,
        author: { select: publicUserSelect },
        lines: true,
        payments: true,
        _count: { select: { timeEntries: true, expenses: true } },
      },
      orderBy: { issueDate: "desc" },
    });
    return NextResponse.json(invoices);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireBillingManager();
    const body = await parseBody(req, invoiceCreateSchema);
    const tipoDocumento = body.tipoDocumento || "boleta_honorarios";
    const invoiceStatus = body.status || "borrador";

    const timeIds = [...new Set(body.timeEntryIds || [])] as string[];
    const expenseIds = [...new Set(body.expenseIds || [])] as string[];
    if (invoiceStatus === "borrador" && (timeIds.length || expenseIds.length)) {
      throw httpError(
        "Las horas y gastos seleccionados solo pueden asociarse a una factura emitida",
        400
      );
    }

    const invoice = await prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findUnique({
        where: { id: body.clienteId },
        select: { id: true },
      });
      if (!cliente) throw httpError("Cliente no encontrado", 404);

      if (body.causaId) {
        const causa = await tx.causa.findUnique({
          where: { id: body.causaId },
          select: { id: true, clienteId: true },
        });
        if (!causa) throw httpError("Causa no encontrada", 404);
        if (causa.clienteId && causa.clienteId !== body.clienteId) {
          throw httpError("La causa no pertenece al cliente de la factura", 400);
        }
      }

      const [times, expenses] = await Promise.all([
        timeIds.length
          ? tx.timeEntry.findMany({ where: { id: { in: timeIds } } })
          : Promise.resolve([]),
        expenseIds.length
          ? tx.expense.findMany({ where: { id: { in: expenseIds } } })
          : Promise.resolve([]),
      ]);

      if (times.length !== timeIds.length || expenses.length !== expenseIds.length) {
        throw httpError("Una hora o gasto seleccionado no existe", 400);
      }

      const invalidTime = times.find(
        (entry) =>
          !entry.billable ||
          entry.billed ||
          entry.invoiceId ||
          entry.clienteId !== body.clienteId ||
          (body.causaId && entry.causaId !== body.causaId)
      );
      if (invalidTime) {
        throw httpError("Una hora seleccionada ya está facturada o no pertenece al cliente/causa", 409);
      }

      const invalidExpense = expenses.find(
        (expense) =>
          !expense.billable ||
          expense.billed ||
          expense.invoiceId ||
          expense.clienteId !== body.clienteId ||
          (body.causaId && expense.causaId !== body.causaId)
      );
      if (invalidExpense) {
        throw httpError("Un gasto seleccionado ya está facturado o no pertenece al cliente/causa", 409);
      }

      const lines: Array<{
        description: string;
        quantity: number;
        unitAmountClp: number;
        amountClp: number;
        tipo: string;
      }> = [
        ...times.map((t) => ({
          description: `${t.hours}h — ${t.description}`,
          quantity: t.hours,
          unitAmountClp: t.rateClp || 0,
          amountClp: t.amountClp,
          tipo: "honorario",
        })),
        ...expenses.map((e) => ({
          description: `[${e.category}] ${e.description}`,
          quantity: 1,
          unitAmountClp: e.amountClp,
          amountClp: e.amountClp,
          tipo: "gasto",
        })),
        ...(body.lines || []).map((l: {
          description: string;
          quantity?: number;
          unitAmountClp: number;
          tipo?: string;
        }) => {
          const quantity = Number(l.quantity || 1);
          const unitAmountClp = Number(l.unitAmountClp);
          return {
            description: l.description,
            quantity,
            unitAmountClp,
            amountClp: Math.round(quantity * unitAmountClp),
            tipo: l.tipo || "honorario",
          };
        }),
      ];

      if (!lines.length) throw httpError("La factura necesita al menos una línea", 400);

      const firm = await tx.firmSettings.findFirst({
        select: { ivaPct: true, defaultRetencionPct: true },
      });
      const totals = computeInvoiceTotals({
        tipoDocumento,
        lines,
        ivaRate: firm?.ivaPct,
        retencionRate: firm?.defaultRetencionPct,
      });
      let number = body.number || "";
      if (!number) {
        const count = await tx.invoice.count();
        for (let offset = 1; offset <= 10; offset++) {
          const candidate = nextInvoiceNumber(count + offset, tipoDocumento);
          const exists = await tx.invoice.findUnique({
            where: { number: candidate },
            select: { id: true },
          });
          if (!exists) {
            number = candidate;
            break;
          }
        }
        if (!number) throw httpError("No se pudo reservar número de factura", 409);
      } else {
        const exists = await tx.invoice.findUnique({
          where: { number },
          select: { id: true },
        });
        if (exists) throw httpError("Ya existe una factura con ese número", 409);
      }

      const created = await tx.invoice.create({
        data: {
          number,
          tipoDocumento,
          status: invoiceStatus,
          issueDate: body.issueDate ? new Date(body.issueDate) : new Date(),
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          ...totals,
          notes: body.notes || null,
          glosa: body.glosa || null,
          clienteId: body.clienteId,
          causaId: body.causaId || null,
          authorId: user.id,
          lines: { create: lines },
        },
        include: { lines: true, cliente: true, causa: true },
      });

      if (timeIds.length) {
        const updated = await tx.timeEntry.updateMany({
          where: { id: { in: timeIds }, billed: false, invoiceId: null },
          data: { billed: true, invoiceId: created.id },
        });
        if (updated.count !== timeIds.length) {
          throw httpError("Una hora fue facturada concurrentemente", 409);
        }
      }
      if (expenseIds.length) {
        const updated = await tx.expense.updateMany({
          where: { id: { in: expenseIds }, billed: false, invoiceId: null },
          data: { billed: true, invoiceId: created.id },
        });
        if (updated.count !== expenseIds.length) {
          throw httpError("Un gasto fue facturado concurrentemente", 409);
        }
      }

      if (created.status === "emitida") {
        const last = await tx.ledgerEntry.findFirst({
          where: { clienteId: created.clienteId },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        });
        const prev = last?.balanceClp ?? 0;
        await tx.ledgerEntry.create({
          data: {
            clienteId: created.clienteId,
            causaId: created.causaId,
            invoiceId: created.id,
            tipo: "cargo_honorario",
            description: `Emisión ${created.number}`,
            debitClp: created.totalClp,
            creditClp: 0,
            balanceClp: prev - created.totalClp,
            date: created.issueDate,
          },
        });
      }

      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(invoice, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
