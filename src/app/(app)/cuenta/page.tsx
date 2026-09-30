import { ModuleHeader } from "@/components/ui/PageHeader";
import { PasswordChangeForm } from "@/components/PasswordChangeForm";
import { TotpSettingsPanel } from "@/components/TotpSettingsPanel";
import { requireUser } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";

export default async function CuentaPage() {
  const user = await requireUser();
  const { dict } = await getI18n();
  const h = dict.hubs.cuenta;

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow={h.eyebrow}
        title={h.title}
        subtitle={`${user.name} · ${user.email}`}
      />
      <PasswordChangeForm />
      <TotpSettingsPanel />
    </div>
  );
}
