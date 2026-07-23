import Link from "next/link";
import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { clp } from "@/lib/billing";
import { StatusBadge, formatDate } from "@/components/ui";
import {
  Clock,
  Receipt,
  Wallet,
  CircleDollarSign,
  FileSpreadsheet,
  PiggyBank,
} from "lucide-react";

export default async function FacturacionPage() {
  const [
    unbilledTime,
    unbilledExpenses,
    openInvoices,
    paidThisMonth,
    allLedger,
    recentInvoices,
    recentTime,
  ] = await Promise.all([
    prisma.timeEntry.findMany({ where: { billable: true, billed: false } }),
    prisma.expense.findMany({ where: { billable: true, billed: false } }),
    prisma.invoice.findMany({
      where: { status: { in: ["emitida", "parcialmente_pagada", "vencida"] } },
      include: { cliente: true },
    }),
    prisma.payment.findMany({
      where: {
        date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    }),
    prisma.ledgerEntry.findMany({
      orderBy: [{ clienteId: "asc" }, { date: "asc" }, { createdAt: "asc" }],
      include: { cliente: true },
    }),
    prisma.invoice.findMany({
      include: { cliente: true, causa: true },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.timeEntry.findMany({
      include: { user: true, causa: true },
      orderBy: { date: "desc" },
      take: 6,
    }),
  ]);

  const unbilledHours = unbilledTime.reduce((s, t) => s + t.hours, 0);
  const unbilledHonorarios = unbilledTime.reduce((s, t) => s + t.amountClp, 0);
  const unbilledGastos = unbilledExpenses.reduce((s, e) => s + e.amountClp, 0);
  const porCobrar = openInvoices.reduce((s, i) => s + Math.max(0, i.totalClp - i.paidClp), 0);
  const cobradoMes = paidThisMonth.reduce((s, p) => s + p.amountClp, 0);
  const balMap = new Map<string, number>();
  for (const e of allLedger) balMap.set(e.clienteId, e.balanceClp);
  const provisionTotal = [...balMap.values()].reduce((s, v) => s + v, 0);

  const stats = [
    { label: "Horas por facturar", value: `${unbilledHours.toFixed(1)} h`, sub: clp(unbilledHonorarios), icon: Clock, href: "/facturacion/horas" },
    { label: "Gastos por facturar", value: clp(unbilledGastos), sub: `${unbilledExpenses.length} ítems`, icon: Wallet, href: "/facturacion/gastos" },
    { label: "Por cobrar", value: clp(porCobrar), sub: `${openInvoices.length} docs`, icon: CircleDollarSign, href: "/facturacion/facturas" },
    { label: "Cobrado este mes", value: clp(cobradoMes), sub: "Pagos recibidos", icon: Receipt, href: "/facturacion/facturas" },
    { label: "Provisión / CC", value: clp(provisionTotal), sub: "Saldo a favor clientes", icon: PiggyBank, href: "/facturacion/cuenta-corriente" },
    { label: "Tarifas", value: "Honorarios", sub: "Condiciones por causa", icon: FileSpreadsheet, href: "/facturacion/tarifas" },
  ];

  return (
    <div className="space-y-8">
      <ModuleHeader
        eyebrow="Contabilidad del estudio"
        title="Facturación"
        subtitle="Horas, gastos, boletas/facturas Chile, pagos y cuenta corriente por cliente/causa."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/facturacion/horas" className="btn btn-ghost">
              + Horas
            </Link>
            <Link href="/facturacion/facturas" className="btn btn-primary">
              Facturas
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(({ label, value, sub, icon: Icon, href }) => (
          <Link key={label} href={href} className="panel rounded-3xl p-5 transition hover:shadow-[var(--shadow)]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--ink-soft)]/70">{label}</span>
              <Icon size={18} className="text-[var(--copper)]" />
            </div>
            <div className="display mt-3 text-3xl">{value}</div>
            <div className="mt-1 text-sm text-[var(--ink-soft)]/65">{sub}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Facturas recientes</h2>
            <Link href="/facturacion/facturas" className="text-sm text-[var(--sea)]">
              Ver todas
            </Link>
          </div>
          <div className="space-y-3">
            {recentInvoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/facturacion/facturas/${inv.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] px-4 py-3"
              >
                <div>
                  <div className="font-medium">{inv.number}</div>
                  <div className="text-sm text-[var(--ink-soft)]/70">
                    {inv.cliente.razonSocial} · {inv.causa?.rit || "Sin causa"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{clp(inv.totalClp)}</div>
                  <StatusBadge
                    estado={
                      inv.status === "pagada"
                        ? "cumplido"
                        : inv.status === "vencida"
                          ? "vencido"
                          : inv.status === "emitida" || inv.status === "parcialmente_pagada"
                            ? "pendiente"
                            : "activa"
                    }
                  />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Time entries recientes</h2>
            <Link href="/facturacion/horas" className="text-sm text-[var(--sea)]">
              Registrar
            </Link>
          </div>
          <div className="space-y-3">
            {recentTime.map((t) => (
              <div key={t.id} className="rounded-2xl border border-[var(--line)] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{t.description}</div>
                  <div className="text-sm font-semibold">{clp(t.amountClp)}</div>
                </div>
                <div className="mt-1 text-sm text-[var(--ink-soft)]/70">
                  {t.hours}h · {t.user.name} · {t.causa?.rit || "—"} · {formatDate(t.date)}
                  {t.billed ? " · facturado" : t.billable ? " · por facturar" : " · no facturable"}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
