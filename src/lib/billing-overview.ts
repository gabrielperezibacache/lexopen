import { prisma } from "@/lib/db";
import { publicUserSelect } from "@/lib/auth/public-user";
import { OPEN_INVOICE_STATUSES } from "@/lib/billing";
import { addCivilDays, santiagoDateKey, santiagoMidnight } from "@/lib/chile-time";

/**
 * Mes calendario de America/Santiago para pagos con timestamp (`new Date()`).
 * El inicio es la medianoche de Santiago, no la medianoche UTC: un pago
 * del 31 a las 22:00 en Chile no cae en el mes siguiente.
 */
export function billingMonthRange(now = new Date()) {
  const key = santiagoDateKey(now);
  const [year, month] = key.split("-").map(Number);
  const monthStr = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const first = `${year}-${monthStr}-01`;
  const next = addCivilDays(
    `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`,
    1
  );
  const start = santiagoMidnight(first);
  const end = new Date(santiagoMidnight(next).getTime() - 1);
  return {
    start,
    end,
    label: billingMonthLabel(now),
    key: `${year}-${monthStr}`,
  };
}

export function billingMonthLabel(now = new Date()) {
  const key = santiagoDateKey(now);
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 15)));
}

/**
 * Saldo por cobrar a partir de sumas SQL (`_sum.totalClp` − `_sum.paidClp`).
 * Equivale a la suma por documento cuando ningún pago supera el total
 * (el alta de pagos rechaza ese caso).
 */
export function receivableFromSums(
  totalClp: number | null | undefined,
  paidClp: number | null | undefined
) {
  const total = totalClp ?? 0;
  const paid = paidClp ?? 0;
  if (!Number.isFinite(total) || !Number.isFinite(paid)) return 0;
  return Math.max(0, total - paid);
}

/** Separa provisión a favor del cliente y adeudo en cuenta corriente. */
export function summarizeProvision(balances: number[]) {
  let provisionClp = 0;
  let adeudoClp = 0;
  let clientsInCredit = 0;
  let clientsInDebt = 0;
  for (const balance of balances) {
    if (!Number.isFinite(balance) || balance === 0) continue;
    if (balance > 0) {
      provisionClp += balance;
      clientsInCredit += 1;
    } else {
      adeudoClp += -balance;
      clientsInDebt += 1;
    }
  }
  return {
    provisionClp,
    adeudoClp,
    netClp: provisionClp - adeudoClp,
    clientsInCredit,
    clientsInDebt,
  };
}

/** KPIs de /facturacion con agregados de base de datos (O(1) en filas históricas). */
export async function loadBillingOverview() {
  const month = billingMonthRange();
  const [
    unbilledTime,
    unbilledExpenses,
    openInvoices,
    paidThisMonth,
    latestBalances,
    recentInvoices,
    recentTime,
  ] = await Promise.all([
    prisma.timeEntry.aggregate({
      where: { billable: true, billed: false },
      _sum: { hours: true, amountClp: true },
      _count: true,
    }),
    prisma.expense.aggregate({
      where: { billable: true, billed: false },
      _sum: { amountClp: true },
      _count: true,
    }),
    prisma.invoice.aggregate({
      where: { status: { in: [...OPEN_INVOICE_STATUSES] } },
      _sum: { totalClp: true, paidClp: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: { date: { gte: month.start, lte: month.end } },
      _sum: { amountClp: true },
      _count: true,
    }),
    prisma.ledgerEntry.findMany({
      distinct: ["clienteId"],
      orderBy: [{ clienteId: "asc" }, { date: "desc" }, { createdAt: "desc" }],
      select: { clienteId: true, balanceClp: true },
    }),
    prisma.invoice.findMany({
      include: { cliente: true, causa: true },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.timeEntry.findMany({
      include: { user: { select: publicUserSelect }, causa: true, cliente: true },
      orderBy: { date: "desc" },
      take: 6,
    }),
  ]);

  const provision = summarizeProvision(latestBalances.map((entry) => entry.balanceClp));

  return {
    month,
    kpis: {
      unbilledHours: unbilledTime._sum.hours ?? 0,
      unbilledHonorarios: unbilledTime._sum.amountClp ?? 0,
      unbilledTimeCount: unbilledTime._count,
      unbilledGastos: unbilledExpenses._sum.amountClp ?? 0,
      unbilledExpenseCount: unbilledExpenses._count,
      porCobrar: receivableFromSums(openInvoices._sum.totalClp, openInvoices._sum.paidClp),
      openInvoiceCount: openInvoices._count,
      cobradoMes: paidThisMonth._sum.amountClp ?? 0,
      cobradoMesCount: paidThisMonth._count,
      ...provision,
    },
    recentInvoices,
    recentTime,
  };
}
