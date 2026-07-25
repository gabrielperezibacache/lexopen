import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { requireStaffPage } from "@/lib/auth/access";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { FirmSettingsForm } from "@/components/FirmSettingsForm";
import { MinutaPlantillasManager } from "@/components/minutas/MinutaPlantillasManager";

export default async function ConfiguracionPage() {
  await requireStaffPage();
  await requireRole("admin");
  const [organization, plantillas] = await Promise.all([
    prisma.organization.findFirst({ include: { settings: true } }),
    prisma.minutaPlantilla.findMany({ orderBy: [{ tipo: "asc" }, { nombre: "asc" }] }),
  ]);
  const org = organization || (await prisma.organization.create({ data: {}, include: { settings: true } }));

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Administración"
        title="Configuración del estudio"
        subtitle="Datos de la organización, emisor tributario, porcentajes por defecto e integraciones."
      />
      <FirmSettingsForm organization={org} />
      <MinutaPlantillasManager plantillas={plantillas} />
    </div>
  );
}
