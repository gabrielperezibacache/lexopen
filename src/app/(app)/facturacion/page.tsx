import { BillingNav } from "@/components/billing/BillingNav";
import Link from "next/link";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { clp, formatHours, labelTimeBillingState } from "@/lib/billing";
import { loadBillingOverview } from "@/lib/billing-overview";
import { formatCivilDate } from "@/lib/chile-time";
import { requireStaff } from "@/lib/auth/session";
import { InvoiceStatusPill } from "@/components/billing/InvoiceStatusPill";
import { getDictionary } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import styles from "./billing.module.css";
import {
  Clock,
  Receipt,
  Wallet,
  CircleDollarSign,
} from "lucide-react";

export default async function FacturacionPage() {
  const user = await requireStaff();
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const b = dict.billingHub;
  const { month, kpis, recentInvoices, recentTime } = await loadBillingOverview(user);

  const provisionSub =
    kpis.adeudoClp > 0
      ? `${kpis.clientsInCredit} con provisión · adeudo ${clp(kpis.adeudoClp)}`
      : kpis.clientsInCredit > 0
        ? `${kpis.clientsInCredit} cliente${kpis.clientsInCredit === 1 ? "" : "s"} con saldo a favor`
        : "Sin saldo en cuenta corriente";

  const stats = [
    {
      label: b.stats.unbilledHours,
      value: formatHours(kpis.unbilledHours),
      sub: clp(kpis.unbilledHonorarios),
      icon: Clock,
      href: "/facturacion/horas?estado=por_facturar",
    },
    {
      label: b.stats.unbilledExpenses,
      value: clp(kpis.unbilledGastos),
      sub: b.stats.items.replace("{count}", String(kpis.unbilledExpenseCount)),
      icon: Wallet,
      href: "/facturacion/gastos?estado=por_facturar",
    },
    {
      label: b.stats.receivables,
      value: clp(kpis.porCobrar),
      sub: b.stats.docs.replace("{count}", String(kpis.openInvoiceCount)),
      icon: CircleDollarSign,
      href: "/facturacion/facturas",
    },
    {
      label: b.stats.paidMonth,
      value: clp(kpis.cobradoMes),
      sub: kpis.cobradoMesCount
        ? `${kpis.cobradoMesCount} pagos · ${month.label}`
        : `Sin pagos en ${month.label}`,
      icon: Receipt,
      href: "/facturacion/facturas",
    },
  ];

  return (
    <div className="space-y-6">
      <ModuleHeader
        title={b.title}
        artwork="billing"
        actions={
          <div className="flex flex-wrap gap-2">
            <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3 text-[var(--ink-soft)]">Informes</summary><Link href="/api/billing/invoices/export?format=csv" className="inline-flex min-h-11 items-center text-[var(--sea)]">{b.exportCsv}</Link></details>
            <Link href="/facturacion/horas" className="btn btn-primary">{b.addHours}</Link>
          </div>
        }
      />
      <BillingNav />

      <section className={`panel ${styles.ledger}`} aria-label={b.title}>
        <div className={styles.stats}>
          {stats.map(({ label, value, sub, icon: Icon, href }) => (
            <Link key={label} href={href} className={styles.stat}>
              <div className={styles.statHeading}>
                <span>{label}</span>
                <Icon size={18} aria-hidden="true" />
              </div>
              <div className={styles.value}>{value}</div>
              <div className={styles.detail}>{sub}</div>
            </Link>
          ))}
        </div>
        {(kpis.provisionClp > 0 || kpis.adeudoClp > 0) && <Link href="/facturacion/cuenta-corriente" className={styles.balance}><span>{b.stats.provision}: {clp(kpis.provisionClp)}</span><span>{provisionSub}</span></Link>}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`panel ${styles.activity}`}>
          <div className={styles.activityHeading}>
            <h2>{b.recentInvoices}</h2>
            <Link href="/facturacion/facturas" className="text-sm text-[var(--sea)]">
              Ver todas
            </Link>
          </div>
          <div className={styles.entries}>
            {recentInvoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/facturacion/facturas/${inv.id}`}
                className={`${styles.entry} ${styles.invoice}`}
              >
                <div className="min-w-0">
                  <div className={styles.entryTitle}>{inv.number}</div>
                  <div className={styles.entryDetail}>
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
              <p className={styles.entryDetail}>
                {b.emptyInvoices}{" "}
                <Link href="/facturacion/facturas" className="text-[var(--sea)]">
                  Emitir documento
                </Link>
              </p>
            )}
          </div>
        </section>

        <section className={`panel ${styles.activity}`}>
          <div className={styles.activityHeading}>
            <h2>{b.recentTime}</h2>
            <Link href="/facturacion/horas" className="text-sm text-[var(--sea)]">
              Registrar
            </Link>
          </div>
          <div className={styles.entries}>
            {recentTime.map((t) => (
              <div key={t.id} className={styles.entry}>
                <div className={styles.timeHeading}>
                  <div className={styles.entryTitle}>{t.description}</div>
                  <div className={styles.amount}>{clp(t.amountClp)}</div>
                </div>
                <div className={styles.entryDetail}>
                  {formatHours(t.hours)} · {t.user.name} · {t.causa?.rit || "—"} · {formatCivilDate(t.date)}
                  {" · "}
                  {labelTimeBillingState(t)}
                </div>
              </div>
            ))}
            {recentTime.length === 0 && (
              <p className={styles.entryDetail}>
                {b.emptyTime}{" "}
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
