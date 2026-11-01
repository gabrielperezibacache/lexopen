import { httpError } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { assertCausaCapability, billingRelatedWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { invoiceStatusAfterPayment } from "@/lib/billing";
import { writeAuditStrict } from "@/lib/audit";
import { executeCommand } from "@/lib/command-execution";
import { paymentCreateSchema } from "@/lib/schemas";
import type { z } from "zod";

export async function createPaymentCommand(user: CausaAccessUser, body: z.infer<typeof paymentCreateSchema>, commandKey: string) {
    const amountClp = body.amountClp;

    return executeCommand({
      key: commandKey, ownerId: user.id, input: body,
      authorize: async (tx) => {
        if (body.invoiceId) {
          const invoice = await tx.invoice.findFirst({ where: { id: body.invoiceId, AND: [billingRelatedWhere(user)] }, select: { id: true } });
          if (!invoice) throw httpError("Factura no encontrada o sin permiso", 404);
        } else if (!can(user, "billing.manage")) throw httpError("Se requiere una factura de un expediente autorizado", 403);
      },
      run: async (tx) => {
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
      if (invoice?.causaId) await assertCausaCapability(invoice.causaId, user, "billing.manage", tx);
      else if (!can(user, "billing.manage")) throw httpError("Sin permiso para este pago", 403);
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

      await writeAuditStrict({
        actorId: user.id,
        action: "billing.payment.create",
        entityType: "Payment",
        entityId: created.id,
        after: { amountClp: created.amountClp, clienteId: created.clienteId, invoiceId: created.invoiceId },
      }, tx);
      return created;
      },
    });

}
