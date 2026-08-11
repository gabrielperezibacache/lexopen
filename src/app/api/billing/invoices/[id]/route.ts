import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  httpError,
  requireBillingManager,
  requireStaff,
} from "@/lib/api";
import { publicUserSelect } from "@/lib/auth/public-user";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireStaff();
    const { id } = await params;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        cliente: true,
        causa: true,
        author: { select: publicUserSelect },
        lines: true,
        payments: { orderBy: { date: "desc" } },
        timeEntries: { include: { user: { select: publicUserSelect } } },
        expenses: true,
      },
    });
    if (!invoice) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    await requireBillingManager();
    const { id } = await params;
    const body = await req.json();
    const invoice = await prisma.$transaction(async (tx) => {
      const current = await tx.invoice.findUnique({ where: { id } });
      if (!current) throw httpError("No encontrada", 404);

      if (
        body.paidClp !== undefined &&
        (!Number.isInteger(Number(body.paidClp)) ||
          Number(body.paidClp) < 0 ||
          Number(body.paidClp) > current.totalClp)
      ) {
        throw httpError("Monto pagado inválido", 400);
      }

      const updated = await tx.invoice.update({
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
        const existingEntry = await tx.ledgerEntry.findFirst({
          where: { invoiceId: updated.id, tipo: "cargo_honorario" },
          select: { id: true },
        });
        if (!existingEntry) {
          const last = await tx.ledgerEntry.findFirst({
            where: { clienteId: updated.clienteId },
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          });
          const prev = last?.balanceClp ?? 0;
          await tx.ledgerEntry.create({
            data: {
              clienteId: updated.clienteId,
              causaId: updated.causaId,
              invoiceId: updated.id,
              tipo: "cargo_honorario",
              description: `Emisión ${updated.number}`,
              debitClp: updated.totalClp,
              creditClp: 0,
              balanceClp: prev - updated.totalClp,
              date: new Date(),
            },
          });
        }
      }

      return updated;
    });

    return NextResponse.json(invoice);
  } catch (e) {
    return handleRouteError(e);
  }
}
