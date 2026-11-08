import { AppShell } from "@/components/AppShell";
import { AltazorCompanionProvider } from "@/components/altazor/AltazorCompanionProvider";
import { enforceAppAccess } from "@/lib/auth/access";
import { canSome } from "@/lib/auth/permissions";
import { isAdmin, isStaff } from "@/lib/auth/rbac";
import { getCaseManagementMode, type CaseManagementMode } from "@/lib/causas/management-mode";
import { buildNavigation } from "@/lib/navigation/catalog";
import { showCommunications } from "@/lib/config/countries";
import { getWorkCountry } from "@/lib/config/work-country";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await enforceAppAccess();
  const staff = isStaff(user.role);
  const [caseManagementMode, workCountry] = await Promise.all([
    staff ? getCaseManagementMode() : Promise.resolve<CaseManagementMode>("manual"),
    staff ? getWorkCountry() : null,
  ]);
  const canSelfUpdate = isAdmin(user);
  return (
    <AppShell
      navigation={buildNavigation(user, { caseManagementMode, communicationsAvailable: staff && showCommunications(workCountry, caseManagementMode) })}
      user={{ id: user.id, name: user.name, email: user.email, role: user.role, avatarColor: user.avatarColor }}
      showUpdateBanner={staff}
      canSelfUpdate={canSelfUpdate}
    >
      {staff && canSome(user, "assistant.use")
        ? <AltazorCompanionProvider userId={user.id}>{children}</AltazorCompanionProvider>
        : children}
    </AppShell>
  );
}
