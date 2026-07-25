import { prisma } from "@/lib/db";
import { formatDate } from "@/components/ui";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { clp } from "@/lib/billing";
import { UfRateForm } from "@/components/billing/UfRateForm";

export default async function UfPage() {
  const rates = await prisma.ufRate.findMany({
    orderBy: { date: "desc" },
    take: 90,
  });
  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Unidad de Fomento"
        title="UF"
        subtitle="Valores diarios para convertir tarifas pactadas en UF a CLP al registrar horas o facturar."
      />
      <UfRateForm />
      <div className="panel overflow-hidden rounded-3xl">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--ink)] text-white/90">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Fuente</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className="table-row">
                <td className="px-4 py-3">{formatDate(r.date)}</td>
                <td className="px-4 py-3">{clp(r.valueClp)}</td>
                <td className="px-4 py-3">{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
