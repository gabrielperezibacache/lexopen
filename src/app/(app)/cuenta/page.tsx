import styles from "@/components/config/WorkspaceArea.module.css";
import Link from "next/link";
import { Bell, Mail, Settings } from "lucide-react";
import { ModuleHeader } from "@/components/ui/PageHeader";
import { PasswordChangeForm } from "@/components/PasswordChangeForm";
import { TotpSettingsPanel } from "@/components/TotpSettingsPanel";
import { requireUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { can, canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { CodexConnection } from "@/components/config/CodexConnection";
import { MAIL_SETTINGS_PATH } from "@/lib/mail/settings-location";

export default async function CuentaPage() {
  const user = await requireUser();
  const { dict, locale, t } = await getI18n();
  const h = dict.hubs.cuenta;
  const staff = isStaff(user.role);
  const canConfigureFirm = staff && can(user, "host.admin");

  return (
    <div className={`${styles.area} space-y-6`}>
      <ModuleHeader
        eyebrow={h.eyebrow}
        title={h.title}
        subtitle={`${user.name} · ${user.email}`}
        actions={<>
          <Link className="btn btn-ghost" href="/cuenta/notificaciones">
            <Bell size={16} aria-hidden="true" /> {dict.nav.notifications}
          </Link>
          {staff && <Link className="btn btn-ghost" href={MAIL_SETTINGS_PATH}><Mail size={16} aria-hidden="true" /> {t("mailbox.openSettings")}</Link>}
          {canConfigureFirm && (
            <Link className="btn btn-secondary" href="/configuracion">
              <Settings size={16} aria-hidden="true" /> {dict.hubs.configuracion.title}
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
      <PasswordChangeForm />
      <TotpSettingsPanel />
      {staff && canSome(user, "assistant.use") && <CodexConnection key={user.id} />}
    </div>
  );
}
