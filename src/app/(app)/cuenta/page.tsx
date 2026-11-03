import styles from "@/components/config/WorkspaceArea.module.css";
import Link from "next/link";
import { ModuleHeader } from "@/components/ui/PageHeader";
import { PasswordChangeForm } from "@/components/PasswordChangeForm";
import { TotpSettingsPanel } from "@/components/TotpSettingsPanel";
import { requireUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { CodexConnection } from "@/components/config/CodexConnection";

export default async function CuentaPage() {
  const user = await requireUser();
  const { dict } = await getI18n();
  const h = dict.hubs.cuenta;

  return (
    <div className={`${styles.area} space-y-6`}>
      <ModuleHeader
        eyebrow={h.eyebrow}
        title={h.title}
        subtitle={`${user.name} · ${user.email}`}
      />
      <p className="text-sm">
        <Link className="text-[var(--sea)] underline" href="/cuenta/notificaciones">
          Preferencias de notificaciones →
        </Link>
      </p>
      <PasswordChangeForm />
      <TotpSettingsPanel />
      {isStaff(user.role) && canSome(user, "assistant.use") && <CodexConnection key={user.id} />}
    </div>
  );
}
