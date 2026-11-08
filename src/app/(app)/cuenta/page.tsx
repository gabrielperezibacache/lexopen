import styles from "@/components/config/WorkspaceArea.module.css";
import Link from "next/link";
import { Bell, MessageSquare, Settings } from "lucide-react";
import { ModuleHeader } from "@/components/ui/PageHeader";
import { PasswordChangeForm } from "@/components/PasswordChangeForm";
import { TotpSettingsPanel } from "@/components/TotpSettingsPanel";
import { requireUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { can, canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { CodexConnection } from "@/components/config/CodexConnection";
import { AltazorDailyBriefSettings } from "@/components/altazor/AltazorDailyBriefSettings";
import { readDailyBriefState } from "@/lib/altazor/daily-brief";
import { MyPermissions } from "@/components/config/MyPermissions";

export default async function CuentaPage() {
  const user = await requireUser();
  const { dict, locale } = await getI18n();
  const h = dict.hubs.cuenta;
  const staff = isStaff(user.role);
  const canConfigureFirm = staff && can(user, "host.admin");
  const dailyBrief = staff && canSome(user, "assistant.use") ? await readDailyBriefState(user) : null;

  return (
    <div className={`${styles.area} space-y-6`}>
      <ModuleHeader
        artwork="settings"
        eyebrow={h.eyebrow}
        title={h.title}
        subtitle={`${user.name} · ${user.email}`}
        actions={<>
          <Link className="btn btn-ghost" href="/cuenta/notificaciones">
            <Bell size={16} aria-hidden="true" /> {dict.nav.notifications}
          </Link>
          {staff && <Link className="btn btn-ghost" href="/cuenta/feedback"><MessageSquare size={16} aria-hidden="true" /> Feedback</Link>}
          {staff && (
            <Link className="btn btn-secondary" href="/configuracion">
              <Settings size={16} aria-hidden="true" /> {dict.nav.settings}
            </Link>
          )}
        </>}
      />
      {staff && !canConfigureFirm && (
        <p className="max-w-prose text-sm text-[var(--muted)]">
          {locale === "en"
            ? "You can change your personal preferences here. Your firm administrator manages the firm settings."
            : "Aquí puedes cambiar tus preferencias personales. La configuración del estudio está a cargo de su administrador."}
        </p>
      )}
      <div id="seguridad" className="space-y-6">
        <PasswordChangeForm />
        <TotpSettingsPanel />
      </div>
      <MyPermissions user={user} locale={locale} />
      {dailyBrief && <AltazorDailyBriefSettings key={`daily-brief:${user.id}`} initial={dailyBrief} locale={locale} />}
      {staff && <CodexConnection key={user.id} />}
    </div>
  );
}
