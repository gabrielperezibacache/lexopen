import type { Prisma, PrismaClient } from "@prisma/client";
import { billingRelatedWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { can } from "@/lib/auth/permissions";
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

/** A legacy ledger row can inherit a private matter through invoice/payment too. */
export function ledgerAccessWhere(user: CausaAccessUser): Prisma.LedgerEntryWhereInput {
  const scope = billingRelatedWhere(user);
  return { AND: [scope,
    { OR: [{ invoiceId: null }, { invoice: scope }] },
    { OR: [{ paymentId: null }, { payment: { OR: [{ invoice: scope }, ...(can(user, "billing.manage") ? [{ invoiceId: null }] : [])] } }] },
  ] };
}

/** Sum visible movements in SQL; stored running balances can include hidden cases. */
export async function loadScopedLedgerBalances(user: CausaAccessUser, client: PrismaClient = prisma) {
  const rows = await client.ledgerEntry.groupBy({ by: ["clienteId"], where: ledgerAccessWhere(user), _sum: { creditClp: true, debitClp: true } });
  return rows.map(row => ({ clienteId: row.clienteId, balanceClp: (row._sum.creditClp || 0) - (row._sum.debitClp || 0) }));
}

export function scopedLedgerRunningBalances<T extends { id: string; clienteId: string; date: Date; createdAt: Date; creditClp: number; debitClp: number; balanceClp: number }>(rows: T[]): T[] {
  const balances = new Map<string, number>();
  return [...rows].sort((a,b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)).map(row => {
    const balanceClp = (balances.get(row.clienteId) || 0) + row.creditClp - row.debitClp;
    balances.set(row.clienteId, balanceClp);
    return { ...row, balanceClp };
  }).reverse();
}

/** KPIs use only the actor's authorized billing scope. */
export async function loadBillingOverview(user: CausaAccessUser, client: PrismaClient = prisma) {
  const scope = billingRelatedWhere(user);
  const month = billingMonthRange();
  const [
    unbilledTime,
    unbilledExpenses,
    openInvoices,
    paidThisMonth,
    latestBalancesRaw,
    recentInvoices,
    recentTime,
  ] = await Promise.all([
    client.timeEntry.aggregate({
      where: { AND: [scope, { billable: true, billed: false }] },
      _sum: { hours: true, amountClp: true },
      _count: true,
    }),
    client.expense.aggregate({
      where: { AND: [scope, { billable: true, billed: false }] },
      _sum: { amountClp: true },
      _count: true,
    }),
    client.invoice.aggregate({
      where: { AND: [scope, { status: { in: [...OPEN_INVOICE_STATUSES] } }] },
      _sum: { totalClp: true, paidClp: true },
      _count: true,
    }),
    client.payment.aggregate({
      where: { date: { gte: month.start, lte: month.end }, OR: [{ invoice: scope }, { invoiceId: null, ledger: { some: scope } }] },
      _sum: { amountClp: true },
      _count: true,
    }),
    loadScopedLedgerBalances(user, client),
    client.invoice.findMany({
      where: scope,
      include: { cliente: true, causa: true },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    client.timeEntry.findMany({
      where: scope,
      include: { user: { select: publicUserSelect }, causa: true, cliente: true },
      orderBy: { date: "desc" },
      take: 6,
    }),
  ]);

  const latestBalances = latestBalancesRaw;
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
