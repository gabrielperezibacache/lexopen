import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, requireBillingManager } from "@/lib/api";
import { publicUserSelect } from "@/lib/auth/public-user";

export async function GET() {
  try {
    await requireBillingManager();
    const [
      unbilledTime,
      unbilledExpenses,
      openInvoices,
      paidThisMonth,
      trustBalance,
      recentInvoices,
      recentTime,
    ] = await Promise.all([
      prisma.timeEntry.aggregate({ where: { billable: true, billed: false }, _sum: { hours: true, amountClp: true } }),
      prisma.expense.aggregate({ where: { billable: true, billed: false }, _sum: { amountClp: true } }),
      prisma.invoice.findMany({
        where: { status: { in: ["emitida", "parcialmente_pagada", "vencida"] } },
        include: { cliente: true, causa: true },
        orderBy: { issueDate: "desc" },
      }),
      prisma.payment.aggregate({
        where: {
          date: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        _sum: { amountClp: true },
      }),
      prisma.ledgerEntry.findMany({
        // ⚡ Bolt: Fetches only the latest ledger entry per client instead of the entire history.
        // Impact: Eliminates O(N) memory/data transfer per client history where N is all past entries.
        distinct: ["clienteId"],
        orderBy: [{ clienteId: "asc" }, { date: "desc" }, { createdAt: "desc" }],
      }),
      prisma.invoice.findMany({
        include: { cliente: true, causa: true },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.timeEntry.findMany({
        include: { user: { select: publicUserSelect }, causa: true, cliente: true },
        orderBy: { date: "desc" },
        take: 8,
      }),
    ]);

    const unbilledHours = unbilledTime._sum.hours || 0;
    const unbilledHonorarios = unbilledTime._sum.amountClp || 0;
    const unbilledGastos = unbilledExpenses._sum.amountClp || 0;
    const porCobrar = openInvoices.reduce(
      (s, i) => s + Math.max(0, i.totalClp - i.paidClp),
      0
    );
    const cobradoMes = paidThisMonth._sum.amountClp || 0;

    // Saldo provisión por cliente (último balance)
    const balanceByClient = new Map<string, number>();
    for (const e of trustBalance) {
      balanceByClient.set(e.clienteId, e.balanceClp);
    }
    const provisionTotal = [...balanceByClient.values()].reduce((s, v) => s + v, 0);

    return NextResponse.json({
      stats: {
        unbilledHours,
        unbilledHonorarios,
        unbilledGastos,
        porCobrar,
        cobradoMes,
        provisionTotal,
        openInvoiceCount: openInvoices.length,
      },
      openInvoices,
      recentInvoices,
      recentTime,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
