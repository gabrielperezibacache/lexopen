import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { ModuleHeader } from "@/components/sites/SiteNav";
import { LanguageSettingsPanel } from "@/components/i18n/LanguageSettingsPanel";
import { FirmSettingsForm } from "@/components/FirmSettingsForm";
import { LlmSettingsForm } from "@/components/LlmSettingsForm";
import { ObsidianSettingsForm } from "@/components/config/ObsidianSettingsForm";
import { GoogleSettingsForm } from "@/components/config/GoogleSettingsForm";
import { PjudSettingsPanel } from "@/components/config/PjudSettingsPanel";
import { RuntimeSettingsPanel } from "@/components/config/RuntimeSettingsPanel";
import { ConfigSectionNav } from "@/components/config/ConfigSectionNav";
import { UsersAdminPanel } from "@/components/config/UsersAdminPanel";
import { IntegrationsOverviewPanel } from "@/components/IntegrationsOverviewPanel";
import { HostStatusPanel } from "@/components/HostStatusPanel";
import { PurgeDemoPanel } from "@/components/PurgeDemoPanel";
import { getHostStatus } from "@/lib/host-status";

export default async function ConfiguracionPage() {
  const me = await requireRole("admin");
  const [organization, hostStatus, users, groups] = await Promise.all([
    prisma.organization.findFirst({ include: { settings: true } }),
    getHostStatus(),
    prisma.user.findMany({
      include: {
        siteMemberships: { include: { site: true } },
        groupMembers: { include: { group: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.group.findMany({
      include: { members: { include: { user: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const settingsOrganization =
    organization ||
    (await prisma.organization.create({ data: {}, include: { settings: true } }));

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Administración"
        title="Configuración del estudio"
        subtitle="Identidad, usuarios, tributario, IA, Obsidian, Google, PJUD, entorno del host e integraciones."
      />
      <ConfigSectionNav />
      <LanguageSettingsPanel />
      <FirmSettingsForm organization={settingsOrganization} />
      <UsersAdminPanel
        currentUserId={me.id}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          title: u.title,
          avatarColor: u.avatarColor,
          siteMemberships: u.siteMemberships.map((m) => ({
            site: { id: m.site.id, name: m.site.name },
          })),
          groupMembers: u.groupMembers.map((m) => ({
            group: { id: m.group.id, name: m.group.name },
          })),
        }))}
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          members: g.members.map((m) => ({
            user: { id: m.user.id, name: m.user.name },
          })),
        }))}
      />
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
