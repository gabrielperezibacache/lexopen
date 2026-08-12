import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { FirmSettingsForm } from "@/components/FirmSettingsForm";
import { LlmSettingsForm } from "@/components/LlmSettingsForm";
import { ObsidianSettingsForm } from "@/components/config/ObsidianSettingsForm";
import { GoogleSettingsForm } from "@/components/config/GoogleSettingsForm";
import { PjudSettingsPanel } from "@/components/config/PjudSettingsPanel";
import { RuntimeSettingsPanel } from "@/components/config/RuntimeSettingsPanel";
import { ConfigSectionNav } from "@/components/config/ConfigSectionNav";
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
        subtitle="Todo lo modificable del estudio: identidad, tributario, IA, Obsidian, Google, PJUD, entorno del host e integraciones."
      />
      <ConfigSectionNav />
      <FirmSettingsForm organization={settingsOrganization} />
      <div id="llm-settings">
        <LlmSettingsForm />
      </div>
      <ObsidianSettingsForm />
      <GoogleSettingsForm />
      <PjudSettingsPanel />
      <RuntimeSettingsPanel />
      <IntegrationsOverviewPanel />
      <HostStatusPanel status={hostStatus} />
      <PurgeDemoPanel />
    </div>
  );
}
