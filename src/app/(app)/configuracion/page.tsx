import { prisma } from "@/lib/db";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireStaff } from "@/lib/auth/session";
import { canSome } from "@/lib/auth/permissions";
import { isAdmin } from "@/lib/auth/rbac";
import { ModuleHeader } from "@/components/ui/PageHeader";
import { getI18n } from "@/lib/i18n/server";
import { TranscriptionSettings } from "@/components/audio/TranscriptionSettings";
import { LanguageSettingsPanel } from "@/components/i18n/LanguageSettingsPanel";
import { FirmSettingsForm } from "@/components/FirmSettingsForm";
import { LlmSettingsForm } from "@/components/LlmSettingsForm";
import { HostCodexSettings } from "@/components/config/HostCodexSettings";
import { ObsidianSettingsForm } from "@/components/config/ObsidianSettingsForm";
import { GoogleSettingsForm } from "@/components/config/GoogleSettingsForm";
import { PjudSettingsPanel } from "@/components/config/PjudSettingsPanel";
import { PjudOpsLogPanel } from "@/components/config/PjudOpsLogPanel";
import { RuntimeSettingsPanel } from "@/components/config/RuntimeSettingsPanel";
import { ConfigSectionNav } from "@/components/config/ConfigSectionNav";
import { configCategoriesForMode } from "@/components/config/config-sections";
import { UsersAdminPanel } from "@/components/config/UsersAdminPanel";
import { IntegrationsOverviewPanel } from "@/components/IntegrationsOverviewPanel";
import { HostStatusPanel } from "@/components/HostStatusPanel";
import { NotifyAdminPanel } from "@/components/config/NotifyAdminPanel";
import { PurgeDemoPanel } from "@/components/PurgeDemoPanel";
import { getHostStatus } from "@/lib/host-status";
import { buildPjudOpsLog } from "@/lib/pjud/ops-log";
import styles from "@/components/config/WorkspaceArea.module.css";
import { CaseManagementSettings } from "@/components/config/CaseManagementSettings";
import { getCaseManagementMode, type CaseManagementMode } from "@/lib/causas/management-mode";
import { MAIL_SETTINGS_PATH } from "@/lib/mail/settings-location";
import { showCommunications, workCountryOptions, type WorkCountry } from "@/lib/config/countries";
import { getWorkCountry } from "@/lib/config/work-country";
import { WorkCountrySettings } from "@/components/config/WorkCountrySettings";
import { AltazorPreferencesPanel } from "@/components/config/AltazorPreferencesPanel";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { firmFormSelect } from "@/lib/config/firm-form-fields";
import { PersonalSettingsIndex } from "@/components/config/PersonalSettingsIndex";
import { ConnectedAccountsPanel } from "@/components/config/ConnectedAccountsPanel";
import { ComputerAuthorizationSettings } from "@/components/config/ComputerAuthorizationSettings";
import { HostSectionSettings } from "@/components/config/HostSectionSettings";
import { getHostNavigationSections } from "@/lib/config/host-navigation-sections";

async function adminSections(userId: string, mode: CaseManagementMode, country: WorkCountry | null, locale: "es" | "en", canSetCountry: boolean): Promise<Record<string, ReactNode>> {
  const [organization, hostStatus, users, groups, visibleSections] = await Promise.all([
    prisma.organization.findFirst({ select: firmFormSelect }),
    getHostStatus(),
    prisma.user.findMany({
      select: {
        id: true, name: true, email: true, role: true, title: true, avatarColor: true,
        capabilityGrants: true, capabilityRevokes: true,
        siteMemberships: { select: { site: { select: { id: true, name: true } } } },
        groupMembers: { select: { group: { select: { id: true, name: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.group.findMany({
      select: { id: true, name: true, description: true, members: { select: { user: { select: { id: true, name: true } } } } },
      orderBy: { name: "asc" },
    }),
    canSetCountry ? getHostNavigationSections() : null,
  ]);
  const settingsOrganization = organization ?? {
    name: "Estudio LexOpen", rut: null, email: null, telefono: null, direccion: null, settings: null,
  };

  const settings = organization ? await prisma.firmSettings.findUnique({
    where: { organizationId: organization.id },
    select: {
      claveUnicaLastSyncAt: true,
      claveUnicaLastSyncStatus: true,
      claveUnicaLastSyncNote: true,
      pjudDigestLastAt: true,
      pjudDigestLastStatus: true,
      pjudDigestLastNote: true,
    },
  }) : null;
  const pjudOpsLog = buildPjudOpsLog({
    generatedAt: hostStatus.generatedAt,
    honesty: hostStatus.pjud.honesty,
    liveIngestConfigured: hostStatus.pjud.liveIngestConfigured,
    sidecar: hostStatus.pjud.sidecar,
    captcha: hostStatus.pjud.captcha,
    claveUnica: {
      lastSyncAt: settings?.claveUnicaLastSyncAt?.toISOString() || null,
      lastSyncStatus: settings?.claveUnicaLastSyncStatus || null,
      lastSyncNote: settings?.claveUnicaLastSyncNote || null,
    },
    digest: {
      lastAt:
        settings?.pjudDigestLastAt?.toISOString() ||
        hostStatus.pjud.digest?.lastAt ||
        null,
      lastStatus:
        settings?.pjudDigestLastStatus ||
        hostStatus.pjud.digest?.lastStatus ||
        null,
      lastNote:
        settings?.pjudDigestLastNote || hostStatus.pjud.digest?.lastNote || null,
    },
    failedJobs: hostStatus.pjud.failedJobs,
  });

  return {
    estudio: <FirmSettingsForm organization={settingsOrganization} />,
    "apartados-visibles": visibleSections ? <HostSectionSettings initial={visibleSections} locale={locale} /> : undefined,
    "work-country": canSetCountry ? <WorkCountrySettings initial={country} locale={locale} options={workCountryOptions(locale)} /> : undefined,
    "case-management-settings": <CaseManagementSettings initialMode={mode} />,
    usuarios: <UsersAdminPanel
        currentUserId={userId}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          title: u.title,
          avatarColor: u.avatarColor,
          capabilityGrants: u.capabilityGrants,
          capabilityRevokes: u.capabilityRevokes,
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
      />,
    "transcription-settings": <div id="transcription-settings"><TranscriptionSettings /></div>,
    "llm-settings": <div id="llm-settings"><LlmSettingsForm /><HostCodexSettings /></div>,
    "obsidian-settings": <ObsidianSettingsForm />,
    "google-settings": <GoogleSettingsForm />,
    "pjud-settings": <PjudSettingsPanel />,
    "pjud-log": <PjudOpsLogPanel
        generatedAt={hostStatus.generatedAt}
        entries={pjudOpsLog}
      />,
    "runtime-settings": <RuntimeSettingsPanel />,
    "notify-settings": <NotifyAdminPanel />,
    "integraciones-overview": <IntegrationsOverviewPanel />,
    "host-status": <HostStatusPanel status={hostStatus} />,
    "purge-demo": <PurgeDemoPanel />,
  };
}

export default async function ConfiguracionPage() {
  const user = await requireStaff();
  const [{ dict, locale, t }, mode, country] = await Promise.all([getI18n(), getCaseManagementMode(), getWorkCountry()]);
  const h = dict.hubs.configuracion;
  const canManage = isAdmin(user);
  const canSetCountry = canManage;
  const visibility = { canManage, canSetCountry, assistant: canSome(user, "assistant.use"), communications: showCommunications(country, mode) };
  const categories = configCategoriesForMode(mode, visibility);
  const tr = (es: string, en: string) => locale === "en" ? en : es;
  const sections: Record<string, ReactNode> = {
    ...(canManage ? await adminSections(user.id, mode, country, locale, canSetCountry) : {}),
    idioma: <div id="idioma"><LanguageSettingsPanel /></div>,
    apariencia: <section id="apariencia" className="panel space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{tr("Apariencia de LexOpen", "LexOpen appearance")}</h3>
        <ThemeToggle />
      </div>
      <Link className="btn btn-ghost" href="/biblioteca?personalizar=1">{tr("Personalizar biblioteca", "Personalize library")}</Link>
    </section>,
    "cuenta-personal": <PersonalSettingsIndex locale={locale} />,
    "preferencias-altazor": visibility.assistant ? <AltazorPreferencesPanel locale={locale} /> : undefined,
    "autorizaciones-escritorio": visibility.assistant ? <ComputerAuthorizationSettings /> : undefined,
    "cuentas-conectadas": visibility.assistant ? <ConnectedAccountsPanel locale={locale} canManage={canManage} /> : undefined,
    comunicaciones: visibility.communications ? <section id="comunicaciones" className="panel space-y-3 p-5">
      <h3 className="text-lg font-semibold">{tr("Correo y mensajes", "Mail and messages")}</h3>
      <p className="max-w-prose text-sm text-[var(--ink-soft)]">{tr("Conecta tu buzón para revisar avisos judiciales y vincularlos a tus causas.", "Connect your mailbox to review court notices and link them to your matters.")}</p>
      <div className="flex flex-wrap gap-2">
        <Link className="btn btn-secondary" href={MAIL_SETTINGS_PATH}>{t("mailbox.openSettings")}</Link>
        <Link className="btn btn-ghost" href="/correo">{t("mailbox.openInbox")}</Link>
        <Link className="btn btn-ghost" href="/mensajes">{t("nav.messages")}</Link>
      </div>
    </section> : undefined,
  };

  return (
    <div className={`${styles.area} space-y-6`} data-settings-workspace>
      <ModuleHeader
        artwork="settings"
        eyebrow={h.eyebrow}
        title={canManage ? h.title : dict.nav.settings}
        subtitle={canManage ? h.subtitle : tr("Ajusta tu cuenta, tus avisos y las herramientas que usas.", "Adjust your account, notifications and tools.")}
      />
      <section className="panel space-y-3 p-5" aria-labelledby="settings-scope-title">
        <h2 id="settings-scope-title" className="text-lg font-semibold">{tr("A quién afectan los ajustes", "Who these settings affect")}</h2>
        <dl className="grid gap-4 text-sm md:grid-cols-3">
          <div><dt className="font-semibold">{tr("Tu usuario", "Your account")}</dt><dd className="mt-1 text-[var(--ink-soft)]">{tr("Tu cuenta, notificaciones, recuerdos y conexiones personales de Altazor y Codex. Cada persona administra los suyos.", "Your account, notifications, memories and personal Altazor and Codex connections. Each person manages their own.")}</dd></div>
          <div><dt className="font-semibold">{tr("Todo el estudio", "The whole firm")}</dt><dd className="mt-1 text-[var(--ink-soft)]">{canManage ? tr("Puedes administrar los datos, usuarios, integraciones y políticas compartidas del Host. Los cambios se aplican a todo el equipo.", "You can administer the Host's shared details, users, integrations and policies. Changes apply to the whole team.") : tr("La administración del Host gestiona los datos, usuarios, integraciones y políticas compartidas. Tus preferencias personales respetan esas políticas.", "Host administrators manage shared details, users, integrations and policies. Your personal preferences follow those policies.")}</dd></div>
          <div><dt className="font-semibold">{tr("Este navegador", "This browser")}</dt><dd className="mt-1 text-[var(--ink-soft)]">{tr("El idioma y la apariencia se conservan en este navegador y pueden mantenerse al cambiar de usuario.", "Language and appearance are saved in this browser and may remain when switching accounts.")}</dd></div>
        </dl>
      </section>
      <ConfigSectionNav categories={categories} />
      <div className={styles.groups}>
        {categories.map(category => (
          <section key={category.id} className={styles.group} aria-labelledby={`settings-${category.id}-title`}>
            <header className={styles.groupHeader}>
              <h2 id={`settings-${category.id}-title`}>{locale === "en" ? category.labelEn : category.label}</h2>
              <p>{locale === "en" ? category.descriptionEn : category.description}</p>
            </header>
            <div className={styles.groupContent}>
              {category.sections.map(section => <div key={section.id} data-config-section={section.id}>{sections[section.id]}</div>)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
