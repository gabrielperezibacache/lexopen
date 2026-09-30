import Link from "next/link";
import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { clp, labelLedgerTipo } from "@/lib/billing";
import { formatCivilDate } from "@/lib/chile-time";
import { LedgerForm } from "@/components/billing/LedgerForm";
import { requireStaff } from "@/lib/auth/session";

export default async function CuentaCorrientePage({
  searchParams,
}: {
  searchParams: Promise<{ clienteId?: string }>;
}) {
  await requireStaff();
  const sp = await searchParams;
  const clientes = await prisma.cliente.findMany({
    orderBy: { razonSocial: "asc" },
    select: { id: true, razonSocial: true },
  });
  const requested = sp.clienteId;
  const clienteId = clientes.some((cliente) => cliente.id === requested)
    ? requested
    : clientes[0]?.id;

  const [entries, latestBalances, causas] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: clienteId ? { clienteId } : { clienteId: { in: [] } },
      include: { causa: true, invoice: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    prisma.ledgerEntry.findMany({
      distinct: ["clienteId"],
      orderBy: [{ clienteId: "asc" }, { date: "desc" }, { createdAt: "desc" }],
      select: { clienteId: true, balanceClp: true },
    }),
    prisma.causa.findMany({
      where: clienteId ? { clienteId } : { clienteId: { in: [] } },
      select: { id: true, rit: true, titulo: true, clienteId: true },
    }),
  ]);

  const balances = new Map<string, number>();
  for (const entry of latestBalances) balances.set(entry.clienteId, entry.balanceClp);
  const nombre = new Map(clientes.map((cliente) => [cliente.id, cliente.razonSocial]));
  const currentBalance = clienteId ? (balances.get(clienteId) ?? 0) : 0;
  const conSaldo = [...balances.entries()].filter(([, balance]) => balance !== 0);

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Provisión de fondos"
        title="Cuenta corriente"
        subtitle="Provisiones, cargos y pagos por cliente. El saldo positivo es plata a favor del cliente; el negativo, un adeudo al estudio. Los documentos se exportan a un facturador externo desde Facturas (CSV/XML, no DTE SII)."
      />

      {clientes.length === 0 ? (
        <p className="panel rounded-3xl p-5 text-sm text-[var(--ink-soft)]/70">
          No hay clientes.{" "}
          <Link href="/clientes" className="text-[var(--sea)]">
            Cree uno en el CRM
          </Link>{" "}
          para abrir la cuenta corriente.
        </p>
      ) : (
        <form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium uppercase tracking-wide text-[var(--ink-soft)]/60">
            Cliente
            <select className="select" name="clienteId" defaultValue={clienteId || ""}>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.razonSocial} · {clp(balances.get(cliente.id) ?? 0)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-secondary" type="submit">
            Ver cuenta
          </button>
        </form>
      )}

      {conSaldo.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {conSaldo.map(([id, balance]) => (
            <a
              key={id}
              href={`/facturacion/cuenta-corriente?clienteId=${id}`}
              className={`panel rounded-3xl p-4 ${clienteId === id ? "ring-2 ring-[var(--sea)]" : ""}`}
            >
              <div className="text-sm text-[var(--ink-soft)]/70">{nombre.get(id) || "Cliente"}</div>
              <div className={`display mt-2 text-2xl ${balance < 0 ? "text-[var(--danger)]" : ""}`}>
                {clp(balance)}
              </div>
              <div className="mt-1 text-xs text-[var(--ink-soft)]/60">
                {balance > 0 ? "Provisión a favor" : "Adeudo al estudio"}
              </div>
            </a>
          ))}
        </div>
      )}

      {clienteId && (
        <>
          <div className="panel rounded-3xl p-4 text-sm">
            Saldo seleccionado: <strong>{clp(currentBalance)}</strong>
            {currentBalance > 0
              ? " (provisión a favor del cliente)"
              : currentBalance < 0
                ? " (el cliente adeuda al estudio)"
                : " (sin movimientos o saldo en cero)"}
          </div>
          <LedgerForm
            clienteId={clienteId}
            causas={causas.filter((causa) => causa.clienteId === clienteId)}
          />
        </>
      )}

      <div className="panel overflow-x-auto rounded-3xl">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--ink)] text-white/90">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3">Debe</th>
              <th className="px-4 py-3">Haber</th>
              <th className="px-4 py-3">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-[var(--ink-soft)]/65" colSpan={6}>
                  {clienteId
                    ? "Sin movimientos en esta cuenta. Registre una provisión o un cargo."
                    : "Sin clientes para mostrar movimientos."}
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="table-row">
                <td className="px-4 py-3">{formatCivilDate(e.date)}</td>
                <td className="px-4 py-3">{labelLedgerTipo(e.tipo)}</td>
                <td className="px-4 py-3">
                  <div>{e.description}</div>
                  <div className="text-xs text-[var(--ink-soft)]/60">
                    {e.causa?.rit || e.invoice?.number || ""}
                  </div>
                </td>
                <td className="px-4 py-3">{e.debitClp ? clp(e.debitClp) : "—"}</td>
                <td className="px-4 py-3">{e.creditClp ? clp(e.creditClp) : "—"}</td>
                <td className="px-4 py-3 font-medium">{clp(e.balanceClp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
