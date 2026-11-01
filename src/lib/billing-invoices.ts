import { httpError } from "@/lib/auth/access";
import { assertBillingCausa, causaAccessWhere as scopedcausaAccessWhere, billingRelatedWhere as scopedrelatedCausaWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { writeAuditStrict } from "@/lib/audit";
import { computeInvoiceTotals, nextInvoiceNumber } from "@/lib/billing";
import { serializable } from "@/lib/command-execution";
import type { invoiceCreateSchema } from "@/lib/schemas";
import type { z } from "zod";

/** Creation, financial state and audit commit together; reads retain the caller's wall. */
export async function createInvoice(user: CausaAccessUser, body: z.infer<typeof invoiceCreateSchema>) {
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

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await serializable(async (tx) => {
          // Global numbering is an internal uniqueness constraint, independent of read scope.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(710031, 1)::text`;
          await assertBillingCausa(user, body.causaId, "billing.manage", tx);
          const cliente = await tx.cliente.findUnique({
            where: { id: body.clienteId },
            select: { id: true },
          });
          if (!cliente) throw httpError("Cliente no encontrado", 404);

          if (body.causaId) {
            const causa = await tx.causa.findFirst({
              where: { AND: [scopedcausaAccessWhere(user), { id: body.causaId }] },
              select: { id: true, clienteId: true },
            });
            if (!causa) throw httpError("Causa no encontrada", 404);
            if (causa.clienteId && causa.clienteId !== body.clienteId) {
              throw httpError("La causa no pertenece al cliente de la factura", 400);
            }
          }

          const [times, expenses] = await Promise.all([
            timeIds.length
              ? tx.timeEntry.findMany({ where: { AND: [scopedrelatedCausaWhere(user), { id: { in: timeIds } }] } })
              : Promise.resolve([]),
            expenseIds.length
              ? tx.expense.findMany({ where: { AND: [scopedrelatedCausaWhere(user), { id: { in: expenseIds } }] } })
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
            for (let offset = 1; offset <= count + 1; offset++) {
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
            const totals = await tx.ledgerEntry.aggregate({ where: { clienteId: created.clienteId }, _sum: { debitClp: true, creditClp: true } });
            const prev = (totals._sum.creditClp || 0) - (totals._sum.debitClp || 0);
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

          await writeAuditStrict({
            actorId: user.id,
            action: "billing.invoice.create",
            entityType: "Invoice",
            entityId: created.id,
            after: { number: created.number, totalClp: created.totalClp, status: created.status, clienteId: created.clienteId },
          }, tx);
          return created;
        });
      } catch (error) {
        // PostgreSQL can report a uniqueness race instead of a serialization
        // failure when two snapshots reserve the same automatic number.
        const conflict = error as { code?: string; meta?: { target?: unknown } };
        const numberConflict = conflict.code === "P2002" && Array.isArray(conflict.meta?.target) && conflict.meta.target.includes("number");
        if (body.number || !numberConflict || attempt >= 4) throw error;
      }
    }
}
