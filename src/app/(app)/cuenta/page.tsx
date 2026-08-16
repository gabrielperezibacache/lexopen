import { ModuleHeader } from "@/components/sites/SiteNav";
import { PasswordChangeForm } from "@/components/PasswordChangeForm";
import { TotpSettingsPanel } from "@/components/TotpSettingsPanel";
import { requireUser } from "@/lib/auth/session";

export default async function CuentaPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Seguridad personal"
        title="Mi cuenta"
        subtitle={`${user.name} · ${user.email}`}
      />
      <PasswordChangeForm />
      <TotpSettingsPanel />
    </div>
  );
}
