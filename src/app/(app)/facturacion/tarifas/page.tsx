import { prisma } from "@/lib/db";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { clp, formatUf, labelFeeTipo } from "@/lib/billing";
import { FeeForm } from "@/components/billing/FeeForm";
import { requireStaff } from "@/lib/auth/session";

export default async function TarifasPage() {
  await requireStaff();
  const [fees, clientes, causas] = await Promise.all([
    prisma.feeArrangement.findMany({
      include: { cliente: true, causa: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.cliente.findMany({ select: { id: true, razonSocial: true } }),
    prisma.causa.findMany({ select: { id: true, titulo: true, rit: true, clienteId: true } }),
  ]);

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Condiciones de honorarios"
        title="Tarifas y honorarios"
        subtitle="Condiciones por hora, suma alzada, retainer, cuota litis o mixtas — por cliente o causa."
      />
      <FeeForm clientes={clientes} causas={causas} />
      <div className="grid gap-4 md:grid-cols-2">
        {fees.map((f) => (
          <article key={f.id} className="panel rounded-3xl p-5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold">{f.name}</h2>
              <span className="flex flex-col items-end gap-1">
                <span className="badge badge-sea">{labelFeeTipo(f.tipo)}</span>
                <span className={`badge ${f.active ? "badge-activa" : "badge-ink"}`}>
                  {f.active ? "Vigente" : "Inactiva"}
                </span>
              </span>
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
              {f.rateHourlyUf != null && (
                <>
                  <dt className="text-[var(--ink-soft)]/60">Tarifa hora UF</dt>
                  <dd className="font-medium">{formatUf(f.rateHourlyUf)}</dd>
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
        {fees.length === 0 && (
          <p className="panel rounded-3xl p-5 text-sm text-[var(--ink-soft)]/70 md:col-span-2">
            Sin tarifas. Defina una condición por hora, suma alzada, retainer o cuota litis.
          </p>
        )}
      </div>
    </div>
  );
}
