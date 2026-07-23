import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { clp, FEE_TIPOS } from "@/lib/billing";
import { FeeForm } from "@/components/billing/FeeForm";

function labelFee(tipo: string) {
  return FEE_TIPOS.find((f) => f.value === tipo)?.label || tipo;
}

export default async function TarifasPage() {
  const [fees, clientes, causas] = await Promise.all([
    prisma.feeArrangement.findMany({
      include: { cliente: true, causa: true, owner: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.cliente.findMany({ select: { id: true, razonSocial: true } }),
    prisma.causa.findMany({ select: { id: true, titulo: true, rit: true, clienteId: true } }),
  ]);

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Fee arrangements"
        title="Tarifas y honorarios"
        subtitle="Condiciones por hora, suma alzada, retainer, cuota litis o mixtas — por cliente o causa."
      />
      <FeeForm clientes={clientes} causas={causas} />
      <div className="grid gap-4 md:grid-cols-2">
        {fees.map((f) => (
          <article key={f.id} className="panel rounded-3xl p-5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold">{f.name}</h2>
              <span className="badge badge-sea">{labelFee(f.tipo)}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--ink-soft)]/75">
              {f.cliente?.razonSocial || "Sin cliente"} · {f.causa?.rit || f.causa?.titulo || "General"}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {f.rateHourlyClp != null && (
                <>
                  <dt className="text-[var(--ink-soft)]/60">Tarifa hora</dt>
                  <dd className="font-medium">{clp(f.rateHourlyClp)}</dd>
                </>
              )}
              {f.flatFeeClp != null && (
                <>
                  <dt className="text-[var(--ink-soft)]/60">Suma alzada</dt>
                  <dd className="font-medium">{clp(f.flatFeeClp)}</dd>
                </>
              )}
              {f.retainerClp != null && (
                <>
                  <dt className="text-[var(--ink-soft)]/60">Retainer</dt>
                  <dd className="font-medium">{clp(f.retainerClp)}</dd>
                </>
              )}
              {f.cuotaLitisPct != null && (
                <>
                  <dt className="text-[var(--ink-soft)]/60">Cuota litis</dt>
                  <dd className="font-medium">{f.cuotaLitisPct}%</dd>
                </>
              )}
              {f.billingCapClp != null && (
                <>
                  <dt className="text-[var(--ink-soft)]/60">Tope</dt>
                  <dd className="font-medium">{clp(f.billingCapClp)}</dd>
                </>
              )}
            </dl>
            {f.notes && <p className="mt-3 text-sm text-[var(--ink-soft)]/80">{f.notes}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}
