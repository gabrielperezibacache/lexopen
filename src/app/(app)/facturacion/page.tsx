import Link from "next/link";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { clp, formatHours, labelTimeBillingState } from "@/lib/billing";
import { loadBillingOverview } from "@/lib/billing-overview";
import { formatCivilDate } from "@/lib/chile-time";
import { requireStaff } from "@/lib/auth/session";
import { InvoiceStatusPill } from "@/components/billing/InvoiceStatusPill";
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
  const { month, kpis, recentInvoices, recentTime } = await loadBillingOverview();

  const provisionSub =
    kpis.adeudoClp > 0
      ? `${kpis.clientsInCredit} con provisión · adeudo ${clp(kpis.adeudoClp)}`
      : kpis.clientsInCredit > 0
        ? `${kpis.clientsInCredit} cliente${kpis.clientsInCredit === 1 ? "" : "s"} con saldo a favor`
        : "Sin saldo en cuenta corriente";

  const stats = [
    {
      label: "Horas por facturar",
      value: formatHours(kpis.unbilledHours),
      sub: clp(kpis.unbilledHonorarios),
      icon: Clock,
      href: "/facturacion/horas?estado=por_facturar",
    },
    {
      label: "Gastos por facturar",
      value: clp(kpis.unbilledGastos),
      sub: `${kpis.unbilledExpenseCount} ítems`,
      icon: Wallet,
      href: "/facturacion/gastos?estado=por_facturar",
    },
    {
      label: "Por cobrar",
      value: clp(kpis.porCobrar),
      sub: `${kpis.openInvoiceCount} documentos`,
      icon: CircleDollarSign,
      href: "/facturacion/facturas",
    },
    {
      label: "Cobrado este mes",
      value: clp(kpis.cobradoMes),
      sub: kpis.cobradoMesCount
        ? `${kpis.cobradoMesCount} pagos · ${month.label}`
        : `Sin pagos en ${month.label}`,
      icon: Receipt,
      href: "/facturacion/facturas",
    },
    {
      label: "Provisión / CC",
      value: clp(kpis.provisionClp),
      sub: provisionSub,
      icon: PiggyBank,
      href: "/facturacion/cuenta-corriente",
    },
    {
      label: "Tarifas",
      value: "Honorarios",
      sub: "Condiciones por causa",
      icon: FileSpreadsheet,
      href: "/facturacion/tarifas",
    },
    {
      label: "UF",
      value: "Valores",
      sub: "Conversión honorarios",
      icon: CircleDollarSign,
      href: "/facturacion/uf",
    },
  ];

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Contabilidad del estudio"
        title="Facturación"
        subtitle="Horas, gastos, boletas y facturas internas (no DTE SII), pagos y cuenta corriente. El mes de cobro es el calendario de Chile. Exporte CSV/XML a un facturador externo desde Facturas."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/facturacion/horas" className="btn btn-ghost">
              + Horas
            </Link>
            <Link href="/api/billing/invoices/export?format=csv" className="btn btn-ghost">
              Exportar CSV
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
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
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
                className="flex min-w-0 items-start justify-between gap-3 rounded-2xl border border-[var(--line)] px-4 py-3 sm:items-center"
              >
                <div className="min-w-0">
                  <div className="font-medium">{inv.number}</div>
                  <div className="break-words text-sm text-[var(--ink-soft)]/70">
                    {inv.cliente.razonSocial} · {inv.causa?.rit || "Sin causa"}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold">{clp(inv.totalClp)}</div>
                  <InvoiceStatusPill status={inv.status} />
                </div>
              </Link>
            ))}
            {recentInvoices.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                Sin facturas aún.{" "}
                <Link href="/facturacion/facturas" className="text-[var(--sea)]">
                  Emitir documento
                </Link>
              </p>
            )}
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <h2 className="text-lg font-semibold">Horas recientes</h2>
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
                  {formatHours(t.hours)} · {t.user.name} · {t.causa?.rit || "—"} · {formatCivilDate(t.date)}
                  {" · "}
                  {labelTimeBillingState(t)}
                </div>
              </div>
            ))}
            {recentTime.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                Sin horas registradas.{" "}
                <Link href="/facturacion/horas" className="text-[var(--sea)]">
                  Cargar tiempo
                </Link>
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
