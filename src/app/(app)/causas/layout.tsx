import { CausasSectionTabs } from "@/components/causas/CausasSectionTabs";
import { requireStaff } from "@/lib/auth/session";
import { getCaseManagementMode } from "@/lib/causas/management-mode";

export default async function CausasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireStaff();
  const mode = await getCaseManagementMode();
  return (
    <div className="space-y-6">
      {mode === "pjud_cl" && <CausasSectionTabs canOperateClaveUnica={user.role !== "asistente"} />}
      {children}
    </div>
  );
}
