import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [
    unbilledTime,
    unbilledExpenses,
    openInvoices,
    paidThisMonth,
    trustBalance,
    recentInvoices,
    recentTime,
  ] = await Promise.all([
    prisma.timeEntry.findMany({ where: { billable: true, billed: false } }),
    prisma.expense.findMany({ where: { billable: true, billed: false } }),
    prisma.invoice.findMany({
      where: { status: { in: ["emitida", "parcialmente_pagada", "vencida"] } },
      include: { cliente: true, causa: true },
      orderBy: { issueDate: "desc" },
    }),
    prisma.payment.findMany({
      where: {
        date: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
    prisma.ledgerEntry.findMany({
      orderBy: [{ clienteId: "asc" }, { date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.invoice.findMany({
      include: { cliente: true, causa: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.timeEntry.findMany({
      include: { user: true, causa: true, cliente: true },
      orderBy: { date: "desc" },
      take: 8,
    }),
  ]);

  const unbilledHours = unbilledTime.reduce((s, t) => s + t.hours, 0);
  const unbilledHonorarios = unbilledTime.reduce((s, t) => s + t.amountClp, 0);
  const unbilledGastos = unbilledExpenses.reduce((s, e) => s + e.amountClp, 0);
  const porCobrar = openInvoices.reduce(
    (s, i) => s + Math.max(0, i.totalClp - i.paidClp),
    0
  );
  const cobradoMes = paidThisMonth.reduce((s, p) => s + p.amountClp, 0);

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
}
