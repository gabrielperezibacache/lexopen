import { PageHeader } from "@/components/ui/PageHeader";
import { MinutaWizard } from "@/components/minutas/MinutaWizard";
import { requireStaffPage } from "@/lib/auth/access";
import { assertCausaCapability, causaAccessWhere as scopedcausaAccessWhere } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { isRealDriveFolderId } from "@/lib/integrations/drive-folder";
import { isValidTipoMinuta } from "@/lib/minutas";
import Link from "next/link";
import { notFound } from "next/navigation";

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string; desde?: string }>;
};

export default async function NuevaMinutaPage({ params, searchParams }: Params) {
  const user = await requireStaffPage();
  const { id } = await params;
  await assertCausaCapability(id, user, "causa.write");
  const sp = await searchParams;
  const causa = await prisma.causa.findFirst({ where: { AND: [scopedcausaAccessWhere(user), { id }] } });
  if (!causa) notFound();

  const tipo =
    sp.tipo && isValidTipoMinuta(sp.tipo) ? sp.tipo : "audiencia";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={sp.desde === "minutas" ? "/minutas?nueva=1#nueva-minuta" : `/causas/${causa.id}`} className="inline-flex min-h-11 items-center text-sm text-[var(--sea)] underline underline-offset-4">
        {sp.desde === "minutas" ? "Volver a elegir causa" : "Volver a la causa"}
      </Link>
      <PageHeader
        artwork="writing"
        title="Nueva minuta"
        subtitle="Completa el contexto y el resumen. Si quedaron compromisos, añádelos antes de guardar."
      />
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
