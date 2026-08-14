import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { MinutaWizard } from "@/components/minutas/MinutaWizard";
import { isRealDriveFolderId } from "@/lib/integrations/drive-folder";
import { isValidTipoMinuta } from "@/lib/minutas";

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string }>;
};

export default async function NuevaMinutaPage({ params, searchParams }: Params) {
  const { id } = await params;
  const sp = await searchParams;
  const causa = await prisma.causa.findUnique({ where: { id } });
  if (!causa) notFound();

  const tipo =
    sp.tipo && isValidTipoMinuta(sp.tipo) ? sp.tipo : "audiencia";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/causas/${causa.id}`} className="text-sm text-[var(--sea)]">
          ← Volver a la causa
        </Link>
        <h1 className="display mt-2 break-words text-2xl sm:text-3xl md:text-4xl">Nueva minuta</h1>
        <p className="mt-2 text-[var(--ink-soft)]/80">
          Tras cada audiencia, reunión o llamada, deje el handoff listo para que
          cualquier abogado continúe la tramitación.
        </p>
      </div>
      <MinutaWizard
        causaId={causa.id}
        causaTitulo={causa.titulo}
        causaRit={causa.rit}
        etapaActual={causa.etapa}
        defaultTipo={tipo}
        hasRealDriveFolder={isRealDriveFolderId(causa.googleDriveFolderId)}
      />
    </div>
  );
}
