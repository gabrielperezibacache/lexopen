import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { clp, DOC_TIPOS } from "@/lib/billing";
import { publicUserSelect } from "@/lib/auth/public-user";
import { StatusBadge, formatDate } from "@/components/ui";
import { InvoiceActions } from "@/components/billing/InvoiceActions";
import { requireStaff } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export default async function InvoiceDetailPage({ params }: Params) {
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
  if (!invoice) notFound();
  const docLabel = DOC_TIPOS.find((d) => d.value === invoice.tipoDocumento)?.label;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/facturacion/facturas" className="text-sm text-[var(--sea)]">
          ← Facturas
        </Link>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="display break-words text-2xl sm:text-3xl md:text-4xl">{invoice.number}</h1>
            <p className="mt-2 break-words text-[var(--ink-soft)]/80">
              {docLabel} · {invoice.cliente.razonSocial}
              {invoice.causa ? ` · ${invoice.causa.rit || invoice.causa.titulo}` : ""}
            </p>
            <div className="mt-3">
              <StatusBadge
                estado={
                  invoice.status === "pagada"
                    ? "cumplido"
                    : invoice.status === "vencida"
                      ? "vencido"
                      : "pendiente"
                }
              />
              <span className="ml-2 text-sm text-[var(--ink-soft)]/65">{invoice.status}</span>
            </div>
          </div>
          <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:w-auto sm:items-end">
            <InvoiceActions
              invoiceId={invoice.id}
              status={invoice.status}
              clienteId={invoice.clienteId}
              balanceClp={invoice.totalClp - invoice.paidClp}
            />
            <a
              href={`/api/billing/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary w-full sm:w-auto"
            >
              Ver PDF / imprimir
            </a>
            <p className="max-w-xs text-left text-xs text-[var(--ink-soft)]/60 sm:text-right">
              Cuenta interna LexOpen — no es DTE SII
            </p>
          </div>
        </div>
      </div>

      <div className="panel grid gap-4 rounded-3xl p-5 sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">Emisión</div>
          <div className="mt-1 font-medium">{formatDate(invoice.issueDate)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">Vencimiento</div>
          <div className="mt-1 font-medium">{formatDate(invoice.dueDate)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">RUT cliente</div>
          <div className="mt-1 font-medium">{invoice.cliente.rut || "—"}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">Autor</div>
          <div className="mt-1 font-medium">{invoice.author?.name || "—"}</div>
        </div>
      </div>

      <section className="panel overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--ink)] text-white/90">
            <tr>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3">Cant.</th>
              <th className="px-4 py-3">P. unitario</th>
              <th className="px-4 py-3">Monto</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id} className="table-row">
                <td className="px-4 py-3">
                  <div className="font-medium">{l.description}</div>
                  <div className="text-xs text-[var(--ink-soft)]/60">{l.tipo}</div>
                </td>
                <td className="px-4 py-3">{l.quantity}</td>
                <td className="px-4 py-3">{clp(l.unitAmountClp)}</td>
                <td className="px-4 py-3">{clp(l.amountClp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
        <div className="space-y-1 border-t border-[var(--line)] px-4 py-4 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{clp(invoice.subtotalClp)}</span>
          </div>
          {invoice.ivaClp > 0 && (
            <div className="flex justify-between">
              <span>IVA 19%</span>
              <span>{clp(invoice.ivaClp)}</span>
            </div>
          )}
          {invoice.retencionClp > 0 && (
            <div className="flex justify-between">
              <span>Retención boleta honorarios</span>
              <span>-{clp(invoice.retencionClp)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{clp(invoice.totalClp)}</span>
          </div>
          <div className="flex justify-between text-[var(--ink-soft)]/75">
            <span>Pagado</span>
            <span>{clp(invoice.paidClp)}</span>
          </div>
          <div className="flex justify-between font-medium text-[var(--copper)]">
            <span>Saldo</span>
            <span>{clp(invoice.totalClp - invoice.paidClp)}</span>
          </div>
        </div>
      </section>

      {invoice.glosa && (
        <div className="panel rounded-3xl p-5 text-sm text-[var(--ink-soft)]/85">
          <strong>Glosa:</strong> {invoice.glosa}
        </div>
      )}

      <section className="panel rounded-3xl p-5">
        <h2 className="text-lg font-semibold">Pagos</h2>
        <div className="mt-3 space-y-2">
          {invoice.payments.map((p) => (
            <div key={p.id} className="flex justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
              <span>
                {formatDate(p.date)} · {p.method}
                {p.reference ? ` · ${p.reference}` : ""}
              </span>
              <span className="font-medium">{clp(p.amountClp)}</span>
            </div>
          ))}
          {invoice.payments.length === 0 && (
            <p className="text-sm text-[var(--ink-soft)]/65">Sin pagos registrados.</p>
          )}
        </div>
      </section>
    </div>
  );
}
