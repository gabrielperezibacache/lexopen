import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { FirmSettingsForm } from "@/components/FirmSettingsForm";
import { HostStatusPanel } from "@/components/HostStatusPanel";
import { getHostStatus } from "@/lib/host-status";

export default async function ConfiguracionPage() {
  await requireRole("admin");
  const [organization, hostStatus] = await Promise.all([
    prisma.organization.findFirst({ include: { settings: true } }),
    getHostStatus(),
  ]);
  const settingsOrganization =
    organization ||
    (await prisma.organization.create({ data: {}, include: { settings: true } }));

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Administración"
        title="Configuración del estudio"
        subtitle="Datos de la organización, emisor tributario, porcentajes por defecto e integraciones."
      />
      <FirmSettingsForm organization={settingsOrganization} />
      <HostStatusPanel status={hostStatus} />
    </div>
  );
}
