import Link from "next/link";
import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/ui/PageHeader";
import { clp } from "@/lib/billing";
import { publicUserSelect } from "@/lib/auth/public-user";
import { StatusBadge, formatDate } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { getDictionary } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import {
  Clock,
  Receipt,
  Wallet,
  CircleDollarSign,
  FileSpreadsheet,
  PiggyBank,
} from "lucide-react";

export default async function FacturacionPage() {
  await requireStaff();
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const b = dict.billingHub;

  const [
    unbilledTime,
    unbilledExpenses,
    openInvoices,
    paidThisMonth,
    latestLedgerBalances,
    recentInvoices,
    recentTime,
  ] = await Promise.all([
    prisma.timeEntry.aggregate({
      where: { billable: true, billed: false },
      _sum: { hours: true, amountClp: true },
    }),
    prisma.expense.aggregate({
      where: { billable: true, billed: false },
      _sum: { amountClp: true },
      _count: { id: true },
    }),
    prisma.invoice.findMany({
      where: { status: { in: ["emitida", "parcialmente_pagada", "vencida"] } },
      select: { totalClp: true, paidClp: true },
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
      distinct: ["clienteId"],
      orderBy: [{ clienteId: "asc" }, { date: "desc" }, { createdAt: "desc" }],
      include: { cliente: true },
    }),
    prisma.invoice.findMany({
      include: { cliente: true, causa: true },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.timeEntry.findMany({
      include: { user: { select: publicUserSelect }, causa: true },
      orderBy: { date: "desc" },
      take: 6,
    }),
  ]);

  const unbilledHours = unbilledTime._sum.hours ?? 0;
  const unbilledHonorarios = unbilledTime._sum.amountClp ?? 0;
  const unbilledGastos = unbilledExpenses._sum.amountClp ?? 0;
  const porCobrar = openInvoices.reduce(
    (s, i) => s + Math.max(0, i.totalClp - i.paidClp),
    0
  );
  const cobradoMes = paidThisMonth._sum.amountClp ?? 0;
  const balMap = new Map<string, number>();
  for (const e of latestLedgerBalances) balMap.set(e.clienteId, e.balanceClp);
  const provisionTotal = [...balMap.values()].reduce((s, v) => s + v, 0);

  const stats = [
    {
      label: b.stats.unbilledHours,
      value: `${unbilledHours.toFixed(1)} h`,
      sub: clp(unbilledHonorarios),
      icon: Clock,
      href: "/facturacion/horas",
    },
    {
      label: b.stats.unbilledExpenses,
      value: clp(unbilledGastos),
      sub: b.stats.items.replace("{count}", String(unbilledExpenses._count.id)),
      icon: Wallet,
      href: "/facturacion/gastos",
    },
    {
      label: b.stats.receivables,
      value: clp(porCobrar),
      sub: b.stats.docs.replace("{count}", String(openInvoices.length)),
      icon: CircleDollarSign,
      href: "/facturacion/facturas",
    },
    {
      label: b.stats.paidMonth,
      value: clp(cobradoMes),
      sub: b.stats.paymentsReceived,
      icon: Receipt,
      href: "/facturacion/facturas",
    },
    {
      label: b.stats.provision,
      value: clp(provisionTotal),
      sub: b.stats.clientCredit,
      icon: PiggyBank,
      href: "/facturacion/cuenta-corriente",
    },
    {
      label: b.stats.rates,
      value: b.stats.honorarios,
      sub: b.stats.feeTerms,
      icon: FileSpreadsheet,
      href: "/facturacion/tarifas",
    },
    {
      label: b.stats.uf,
      value: b.stats.ufValues,
      sub: b.stats.ufHint,
      icon: CircleDollarSign,
      href: "/facturacion/uf",
    },
  ];

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow={b.eyebrow}
        title={b.title}
        subtitle={b.subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/facturacion/horas" className="btn btn-ghost">
              {b.addHours}
            </Link>
            <Link
              href="/api/billing/invoices/export?format=csv"
              className="btn btn-ghost"
            >
              {b.exportCsv}
            </Link>
            <Link href="/facturacion/facturas" className="btn btn-primary">
              {b.title}
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(({ label, value, sub, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            className="panel rounded-[var(--radius-xl)] p-5 transition hover:shadow-[var(--shadow)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--muted)]">{label}</span>
              <Icon size={18} className="text-[var(--copper)]" aria-hidden />
            </div>
            <div className="display mt-3 text-3xl">{value}</div>
            <div className="mt-1 text-sm text-[var(--muted)]">{sub}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-[var(--radius-xl)] p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <h2 className="text-lg font-semibold">{b.recentInvoices}</h2>
            <Link href="/facturacion/facturas" className="text-sm text-[var(--sea)]">
              {dict.common.next}
            </Link>
          </div>
          <div className="space-y-3">
            {recentInvoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/facturacion/facturas/${inv.id}`}
                className="flex min-w-0 items-start justify-between gap-3 rounded-2xl border border-[var(--line)] px-4 py-3 sm:items-center"
              >
                <div className="min-w-0">
                  <div className="font-medium">{inv.number}</div>
                  <div className="break-words text-sm text-[var(--muted)]">
                    {inv.cliente.razonSocial} · {inv.causa?.rit || "—"}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold">{clp(inv.totalClp)}</div>
                  <StatusBadge
                    estado={
                      inv.status === "pagada"
                        ? "cumplido"
                        : inv.status === "vencida"
                          ? "vencido"
                          : inv.status === "emitida" ||
                              inv.status === "parcialmente_pagada"
                            ? "pendiente"
                            : "activa"
                    }
                  />
                </div>
              </Link>
            ))}
            {recentInvoices.length === 0 && (
              <p className="text-sm text-[var(--muted)]">{b.emptyInvoices}</p>
            )}
          </div>
        </section>

        <section className="panel rounded-[var(--radius-xl)] p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <h2 className="text-lg font-semibold">{b.recentTime}</h2>
            <Link href="/facturacion/horas" className="text-sm text-[var(--sea)]">
              {b.addHours}
            </Link>
          </div>
          <div className="space-y-3">
            {recentTime.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl border border-[var(--line)] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{entry.description}</div>
                  <div className="text-sm font-semibold">{clp(entry.amountClp)}</div>
                </div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  {entry.hours}h · {entry.user.name} · {entry.causa?.rit || "—"} ·{" "}
                  {formatDate(entry.date, locale)}
                </div>
              </div>
            ))}
            {recentTime.length === 0 && (
              <p className="text-sm text-[var(--muted)]">{b.emptyTime}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
