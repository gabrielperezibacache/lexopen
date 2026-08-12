import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { FirmSettingsForm } from "@/components/FirmSettingsForm";
import { LlmSettingsForm } from "@/components/LlmSettingsForm";
import { IntegrationsOverviewPanel } from "@/components/IntegrationsOverviewPanel";
import { HostStatusPanel } from "@/components/HostStatusPanel";
import { PurgeDemoPanel } from "@/components/PurgeDemoPanel";
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
        subtitle="Datos de la organización, emisor tributario, endpoints de IA (OpenAI / custom), APIs e integraciones."
      />
      <FirmSettingsForm organization={settingsOrganization} />
      <div id="llm-settings">
        <LlmSettingsForm />
      </div>
      <IntegrationsOverviewPanel />
      <HostStatusPanel status={hostStatus} />
      <PurgeDemoPanel />
    </div>
  );
}
