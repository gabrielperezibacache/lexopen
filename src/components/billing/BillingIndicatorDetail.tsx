import Link from "next/link";
import { BillingNav } from "./BillingNav";
import { ModuleHeader } from "@/components/sites/SiteNav";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { clp } from "@/lib/billing";
import { indicatorHref, indicatorMonth, openInvoiceWhere, paidInMonthWhere, receivableFromSums, type BillingIndicator } from "@/lib/billing-overview";
import { civilDateKey, SANTIAGO_TZ } from "@/lib/chile-time";
import { prisma } from "@/lib/db";

const pageSize = 25;
function pageWindow(raw: string | undefined, count: number) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const page = raw && /^\d{1,8}$/.test(raw) ? Math.max(1, Math.min(pages, Number(raw))) : 1;
  return { page, pages, skip: (page - 1) * pageSize };
}

async function paymentRows(user: CausaAccessUser, month: ReturnType<typeof indicatorMonth>, requestedPage?: string) {
  const where = paidInMonthWhere(user, month);
  const totals = await prisma.payment.aggregate({ where, _count: true, _sum: { amountClp: true } });
  const window = pageWindow(requestedPage, totals._count);
  const payments = await prisma.payment.findMany({
    where, orderBy: [{ date: "desc" }, { id: "desc" }], skip: window.skip, take: pageSize,
    select: { id: true, date: true, amountClp: true, cliente: { select: { razonSocial: true } }, invoice: { select: { id: true, number: true } } },
  });
  return { ...window, count: totals._count, amount: totals._sum.amountClp ?? 0,
    rows: payments.map(p => ({ id: p.id, date: p.date, amount: p.amountClp, client: p.cliente.razonSocial, invoice: p.invoice })) };
}

async function receivableRows(user: CausaAccessUser, requestedPage?: string) {
  const where = openInvoiceWhere(user);
  const totals = await prisma.invoice.aggregate({ where, _count: true, _sum: { totalClp: true, paidClp: true } });
  const window = pageWindow(requestedPage, totals._count);
  const invoices = await prisma.invoice.findMany({
    where, orderBy: [{ issueDate: "desc" }, { id: "desc" }], skip: window.skip, take: pageSize,
    select: { id: true, number: true, issueDate: true, totalClp: true, paidClp: true, cliente: { select: { razonSocial: true } } },
  });
  return { ...window, count: totals._count, amount: receivableFromSums(totals._sum.totalClp, totals._sum.paidClp),
    rows: invoices.map(i => ({ id: i.id, date: new Date(civilDateKey(i.issueDate)), amount: receivableFromSums(i.totalClp, i.paidClp), client: i.cliente.razonSocial, invoice: { id: i.id, number: i.number } })) };
}

export async function BillingIndicatorDetail({ user, indicator, monthKey, requestedPage, english }: {
  user: CausaAccessUser; indicator: BillingIndicator; monthKey?: string; requestedPage?: string; english: boolean;
}) {
  const month = indicatorMonth(monthKey);
  const payments = indicator === "pagos";
  const { rows, amount, page, pages, count } = payments ? await paymentRows(user, month, requestedPage) : await receivableRows(user, requestedPage);
  const locale = english ? "en-GB" : "es-CL";
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: payments ? SANTIAGO_TZ : "UTC" });
  const heading = payments ? (english ? "Payments received" : "Pagos recibidos") : (english ? "Receivables" : "Por cobrar");
  const monthLabel = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: SANTIAGO_TZ }).format(month.start);
  const unit = payments
    ? (english ? (count === 1 ? "payment" : "payments") : (count === 1 ? "pago" : "pagos"))
    : (english ? (count === 1 ? "invoice" : "invoices") : (count === 1 ? "documento" : "documentos"));
  const context = new URLSearchParams({ desde: indicator });
  if (payments) context.set("mes", month.key);
  if (page > 1) context.set("pagina", String(page));

  return <div className="space-y-6">
    <ModuleHeader title={heading} artwork="billing" />
    <BillingNav overview={false} />
    {payments && <form className="flex flex-wrap items-end gap-3" action="/facturacion" method="get">
      <input name="detalle" type="hidden" value="pagos" />
      <label className="flex flex-col gap-1 text-sm">{english ? "Payment month (Chile)" : "Mes de pago (Chile)"}
        <input name="mes" type="month" required defaultValue={month.key} className="input" />
      </label>
      <button className="btn btn-secondary" type="submit">{english ? "Apply" : "Aplicar"}</button>
    </form>}
    <section className="panel rounded-2xl p-5" aria-label={heading}>
      <h2 className="text-xl font-semibold">{clp(amount)}</h2>
      <p className="my-2 text-sm text-[var(--muted)]">{count} {unit}{payments && ` · ${monthLabel}`}</p>
      {rows.length ? <ul className="divide-y divide-[var(--line)]">
        {rows.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-4 py-3">
          <div className="min-w-0 break-words">
            {row.invoice ? <Link className="text-[var(--sea)] underline" href={`/facturacion/facturas/${row.invoice.id}?${context}`}>{row.invoice.number}</Link> : (english ? "Payment without invoice" : "Pago sin factura vinculada")}
            <p className="text-sm text-[var(--ink-soft)]">{row.client} · <time dateTime={row.date.toISOString()}>{date.format(row.date)}</time></p>
          </div>
          <span className="font-medium tabular-nums">{clp(row.amount)}</span>
        </li>)}
      </ul> : <p className="py-3">{payments ? (english ? "No payments for this month." : "Sin pagos en este mes.") : (english ? "No open invoices." : "Sin documentos pendientes de cobro.")}</p>}
      {pages > 1 && <nav className="mt-4 flex flex-wrap items-center gap-3" aria-label={english ? "Result pages" : "Páginas de resultados"}>
        {page > 1 && <Link className="btn btn-secondary" href={indicatorHref(indicator, month.key, page - 1)}>{english ? "Previous" : "Anterior"}</Link>}
        <span>{page} / {pages}</span>
        {page < pages && <Link className="btn btn-secondary" href={indicatorHref(indicator, month.key, page + 1)}>{english ? "Next" : "Siguiente"}</Link>}
      </nav>}
    </section>
  </div>;
}
