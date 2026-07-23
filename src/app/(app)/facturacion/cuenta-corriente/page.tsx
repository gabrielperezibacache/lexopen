import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { clp } from "@/lib/billing";
import { formatDate } from "@/components/ui";
import { LedgerForm } from "@/components/billing/LedgerForm";

export default async function CuentaCorrientePage({
  searchParams,
}: {
  searchParams: Promise<{ clienteId?: string }>;
}) {
  const sp = await searchParams;
  const clientes = await prisma.cliente.findMany({ orderBy: { razonSocial: "asc" } });
  const clienteId = sp.clienteId || clientes[0]?.id;

  const [entries, allForBalance, causas] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: clienteId ? { clienteId } : undefined,
      include: { cliente: true, causa: true, invoice: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    prisma.ledgerEntry.findMany({
      orderBy: [{ clienteId: "asc" }, { date: "asc" }, { createdAt: "asc" }],
      include: { cliente: true },
    }),
    prisma.causa.findMany({
      where: clienteId ? { clienteId } : undefined,
      select: { id: true, rit: true, titulo: true, clienteId: true },
    }),
  ]);

  const balances = new Map<string, { nombre: string; balanceClp: number }>();
  for (const e of allForBalance) {
    balances.set(e.clienteId, { nombre: e.cliente.razonSocial, balanceClp: e.balanceClp });
  }

  const currentBalance = clienteId ? balances.get(clienteId)?.balanceClp ?? 0 : 0;

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Trust / client ledger"
        title="Cuenta corriente"
        subtitle="Provisiones de fondos, cargos por honorarios/gastos, pagos y saldo a favor del cliente."
      />

      <div className="grid gap-4 md:grid-cols-3">
        {[...balances.entries()].map(([id, b]) => (
          <a
            key={id}
            href={`/facturacion/cuenta-corriente?clienteId=${id}`}
            className={`panel rounded-3xl p-4 ${clienteId === id ? "ring-2 ring-[var(--sea)]" : ""}`}
          >
            <div className="text-sm text-[var(--ink-soft)]/70">{b.nombre}</div>
            <div className={`display mt-2 text-2xl ${b.balanceClp < 0 ? "text-[var(--danger)]" : ""}`}>
              {clp(b.balanceClp)}
            </div>
          </a>
        ))}
      </div>

      {clienteId && (
        <>
          <div className="panel rounded-3xl p-4 text-sm">
            Saldo seleccionado: <strong>{clp(currentBalance)}</strong>
            {currentBalance > 0
              ? " (provisión a favor del cliente)"
              : currentBalance < 0
                ? " (cliente adeuda al estudio)"
                : ""}
          </div>
          <LedgerForm
            clienteId={clienteId}
            causas={causas.filter((c) => c.clienteId === clienteId)}
          />
        </>
      )}

      <div className="panel overflow-hidden rounded-3xl">
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
            {entries.map((e) => (
              <tr key={e.id} className="table-row">
                <td className="px-4 py-3">{formatDate(e.date)}</td>
                <td className="px-4 py-3">{e.tipo}</td>
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
