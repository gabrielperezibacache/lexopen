import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { FirmSettingsForm } from "@/components/FirmSettingsForm";
import { LlmSettingsForm } from "@/components/LlmSettingsForm";

export default async function ConfiguracionPage() {
  await requireRole("admin");
  const organization =
    (await prisma.organization.findFirst({ include: { settings: true } })) ||
    (await prisma.organization.create({ data: {}, include: { settings: true } }));

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Administración"
        title="Configuración del estudio"
        subtitle="Datos de la organización, emisor tributario, porcentajes por defecto e integraciones."
      />
      <FirmSettingsForm organization={organization} />
      <LlmSettingsForm />
    </div>
  );
}
